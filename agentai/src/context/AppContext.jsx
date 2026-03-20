import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { employeesApi, costCodesApi, allocationsApi, lookupsApi, schemasApi } from '../services/api';

const AppContext = createContext();

const defaultState = {
  employees: [],
  costCodes: [],
  allocations: [],
  lookups: {},
  schemas: {},
  allocationWindow: { startDate: '', endDate: '', enabled: false },
  loading: true,
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    // Loading
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'LOAD_DATA':
      return {
        ...state,
        employees: action.payload.employees || state.employees,
        costCodes: action.payload.costCodes || state.costCodes,
        allocations: action.payload.allocations || state.allocations,
        lookups: action.payload.lookups !== undefined ? action.payload.lookups : state.lookups,
        schemas: action.payload.schemas !== undefined ? action.payload.schemas : state.schemas,
        loading: false,
        error: null,
      };
    case 'SET_LOOKUPS':
      return { ...state, lookups: action.payload };
    case 'SET_SCHEMAS':
      return { ...state, schemas: action.payload };
    case 'UPDATE_SCHEMA':
      return { ...state, schemas: { ...state.schemas, [action.payload.entityType]: action.payload.schema } };

    // Employees
    case 'ADD_EMPLOYEE':
      return { ...state, employees: [...state.employees, action.payload] };
    case 'UPDATE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.map(e => e.id === action.payload.id ? { ...e, ...action.payload } : e),
      };
    case 'RENAME_EMPLOYEE_ID': {
      const { oldId, newId, data } = action.payload;
      return {
        ...state,
        employees: state.employees.map(e => {
          if (e.id === oldId) return { ...data, id: newId };
          if (e.supervisor === oldId) return { ...e, supervisor: newId };
          return e;
        }),
      };
    }
    case 'DELETE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.filter(e => e.id !== action.payload),
        allocations: state.allocations.filter(a => a.employeeId !== action.payload),
      };
    case 'BULK_DELETE_EMPLOYEES': {
      const idSet = new Set(action.payload);
      return {
        ...state,
        employees: state.employees.filter(e => !idSet.has(e.id)),
        allocations: state.allocations.filter(a => !idSet.has(a.employeeId)),
      };
    }

    // Cost Codes
    case 'ADD_COST_CODE':
      return { ...state, costCodes: [...state.costCodes, action.payload] };
    case 'UPDATE_COST_CODE':
      return {
        ...state,
        costCodes: state.costCodes.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c),
      };
    case 'DELETE_COST_CODE':
      return {
        ...state,
        costCodes: state.costCodes.filter(c => c.id !== action.payload),
        allocations: state.allocations.filter(a => a.costCodeId !== action.payload),
      };
    case 'BULK_DELETE_COST_CODES': {
      const idSet = new Set(action.payload);
      return {
        ...state,
        costCodes: state.costCodes.filter(c => !idSet.has(c.id)),
        allocations: state.allocations.filter(a => !idSet.has(a.costCodeId)),
      };
    }

    // Allocations
    case 'ADD_ALLOCATION':
      return { ...state, allocations: [...state.allocations, action.payload] };
    case 'UPDATE_ALLOCATION':
      return {
        ...state,
        allocations: state.allocations.map(a => a.id === action.payload.id ? { ...a, ...action.payload } : a),
      };
    case 'PATCH_ALLOCATION_TYPE':
      return {
        ...state,
        allocations: state.allocations.map(a => a.id === action.payload.id ? { ...a, ...action.payload } : a),
      };
    case 'DELETE_ALLOCATION':
      return { ...state, allocations: state.allocations.filter(a => a.id !== action.payload) };
    case 'BULK_DELETE_ALLOCATIONS': {
      const idSet = new Set(action.payload);
      return { ...state, allocations: state.allocations.filter(a => !idSet.has(a.id)) };
    }

    // Bulk import — replace data in state after API call
    case 'IMPORT_DATA':
      return {
        ...state,
        employees: action.payload.employees || state.employees,
        costCodes: action.payload.costCodes || state.costCodes,
        allocations: action.payload.allocations || state.allocations,
      };

    // Allocation Window (client-side only)
    case 'SET_ALLOCATION_WINDOW':
      return { ...state, allocationWindow: action.payload };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, defaultState);
  const location = useLocation();
  const lastFetchRef = useRef(0);

  // Shared data-loading function
  const refreshData = useCallback(async ({ silent = false } = {}) => {
    // Throttle: skip if last fetch was < 2 seconds ago
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    try {
      if (!silent) rawDispatch({ type: 'SET_LOADING', payload: true });
      const [employees, costCodes, allocations, lookupsArr, schemas] = await Promise.all([
        employeesApi.getAll(),
        costCodesApi.getAll(),
        allocationsApi.getAll(),
        lookupsApi.getAll(),
        schemasApi.getAll(),
      ]);
      const lookups = {};
      (lookupsArr || []).forEach(item => { lookups[item.category] = item.values || []; });
      if (lookups['session-timeout']?.[0]) localStorage.setItem('allocDashTimeout', lookups['session-timeout'][0]);
      rawDispatch({ type: 'LOAD_DATA', payload: { employees, costCodes, allocations, lookups, schemas } });
    } catch (err) {
      console.error('Failed to load data:', err);
      if (!silent) rawDispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  // Load data on mount
  useEffect(() => { refreshData(); }, [refreshData]);

  // Re-fetch when navigating between pages (route change)
  useEffect(() => { refreshData({ silent: true }); }, [location.pathname, refreshData]);

  // Re-fetch when browser tab becomes visible again
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') refreshData({ silent: true });
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshData]);

  // Persist allocation window to localStorage
  useEffect(() => {
    if (state.allocationWindow) {
      try {
        localStorage.setItem('allocationWindow', JSON.stringify(state.allocationWindow));
      } catch (e) { /* ignore */ }
    }
  }, [state.allocationWindow]);

  // Load allocation window from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('allocationWindow');
      if (stored) {
        rawDispatch({ type: 'SET_ALLOCATION_WINDOW', payload: JSON.parse(stored) });
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Async dispatch wrapper — calls API then updates state
  const dispatch = useCallback(async (action) => {
    try {
      switch (action.type) {
        // Employees
        case 'ADD_EMPLOYEE': {
          const result = await employeesApi.create(action.payload);
          rawDispatch({ type: 'ADD_EMPLOYEE', payload: result });
          return result;
        }
        case 'UPDATE_EMPLOYEE': {
          const { id, ...data } = action.payload;
          const result = await employeesApi.update(id, data);
          rawDispatch({ type: 'UPDATE_EMPLOYEE', payload: result });
          return result;
        }
        case 'RENAME_EMPLOYEE_ID': {
          const { oldId, newId, updates } = action.payload;
          await employeesApi.delete(oldId);
          const result = await employeesApi.create({ ...updates, id: newId });
          rawDispatch({ type: 'RENAME_EMPLOYEE_ID', payload: { oldId, newId, data: result } });
          return result;
        }
        case 'DELETE_EMPLOYEE': {
          await employeesApi.delete(action.payload);
          rawDispatch({ type: 'DELETE_EMPLOYEE', payload: action.payload });
          return;
        }
        case 'BULK_DELETE_EMPLOYEES': {
          await employeesApi.bulkDelete(action.payload);
          rawDispatch({ type: 'BULK_DELETE_EMPLOYEES', payload: action.payload });
          return;
        }

        // Cost Codes
        case 'ADD_COST_CODE': {
          const result = await costCodesApi.create(action.payload);
          rawDispatch({ type: 'ADD_COST_CODE', payload: result });
          return result;
        }
        case 'UPDATE_COST_CODE': {
          const { id, ...data } = action.payload;
          const result = await costCodesApi.update(id, data);
          rawDispatch({ type: 'UPDATE_COST_CODE', payload: result });
          return result;
        }
        case 'DELETE_COST_CODE': {
          await costCodesApi.delete(action.payload);
          rawDispatch({ type: 'DELETE_COST_CODE', payload: action.payload });
          return;
        }
        case 'BULK_DELETE_COST_CODES': {
          await costCodesApi.bulkDelete(action.payload);
          rawDispatch({ type: 'BULK_DELETE_COST_CODES', payload: action.payload });
          return;
        }

        // Allocations
        case 'ADD_ALLOCATION': {
          const result = await allocationsApi.create(action.payload);
          rawDispatch({ type: 'ADD_ALLOCATION', payload: result });
          return result;
        }
        case 'UPDATE_ALLOCATION': {
          const { id, ...data } = action.payload;
          const result = await allocationsApi.update(id, data);
          rawDispatch({ type: 'UPDATE_ALLOCATION', payload: result });
          return result;
        }
        case 'PATCH_ALLOCATION_TYPE': {
          const { id, allocationType, lastModifiedBy } = action.payload;
          const result = await allocationsApi.updateType(id, allocationType, lastModifiedBy);
          rawDispatch({ type: 'PATCH_ALLOCATION_TYPE', payload: result });
          return result;
        }
        case 'DELETE_ALLOCATION': {
          await allocationsApi.delete(action.payload);
          rawDispatch({ type: 'DELETE_ALLOCATION', payload: action.payload });
          return;
        }
        case 'BULK_DELETE_ALLOCATIONS': {
          await allocationsApi.bulkDelete(action.payload);
          rawDispatch({ type: 'BULK_DELETE_ALLOCATIONS', payload: action.payload });
          return;
        }

        // Lookups
        case 'UPDATE_LOOKUP': {
          const { category, values } = action.payload;
          const result = await lookupsApi.update(category, values);
          const lookupsArr = await lookupsApi.getAll();
          const lookups = {};
          (lookupsArr || []).forEach(item => { lookups[item.category] = item.values || []; });
          if (category === 'session-timeout') localStorage.setItem('allocDashTimeout', values[0] || '15');
          rawDispatch({ type: 'SET_LOOKUPS', payload: lookups });
          return result;
        }
        case 'IMPORT_LOOKUPS': {
          const result = await lookupsApi.bulkImport(action.payload);
          const lookupsArr = await lookupsApi.getAll();
          const lookups = {};
          (lookupsArr || []).forEach(item => { lookups[item.category] = item.values || []; });
          rawDispatch({ type: 'SET_LOOKUPS', payload: lookups });
          return result;
        }

        // Schemas
        case 'UPDATE_SCHEMA': {
          const { entityType, fields } = action.payload;
          const result = await schemasApi.update(entityType, fields);
          rawDispatch({ type: 'UPDATE_SCHEMA', payload: { entityType, schema: { fields: result.fields } } });
          return result;
        }

        // Bulk import
        case 'IMPORT_DATA': {
          const results = {};
          if (action.payload.employees?.length) {
            const r = await employeesApi.bulkImport(action.payload.employees);
            results.employees = r.items;
          }
          if (action.payload.costCodes?.length) {
            const r = await costCodesApi.bulkImport(action.payload.costCodes);
            results.costCodes = r.items;
          }
          if (action.payload.allocations?.length) {
            const r = await allocationsApi.bulkImport(action.payload.allocations);
            results.allocations = r.items;
          }
          // Reload all data after import to get consistent state
          const [employees, costCodes, allocations, lookupsArr] = await Promise.all([
            employeesApi.getAll(),
            costCodesApi.getAll(),
            allocationsApi.getAll(),
            lookupsApi.getAll(),
          ]);
          const lookups = {};
          (lookupsArr || []).forEach(item => { lookups[item.category] = item.values || []; });
          rawDispatch({ type: 'LOAD_DATA', payload: { employees, costCodes, allocations, lookups } });
          return results;
        }

        // Client-side only actions
        case 'SET_ALLOCATION_WINDOW':
        case 'RESET_DATA':
          rawDispatch(action);
          return;

        default:
          rawDispatch(action);
          return;
      }
    } catch (err) {
      console.error(`Action ${action.type} failed:`, err);
      throw err;
    }
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, refreshData }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}
