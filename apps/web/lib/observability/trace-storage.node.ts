import { AsyncLocalStorage } from 'node:async_hooks';
import { installTraceStorage, type TraceContext } from './trace-context';

installTraceStorage(new AsyncLocalStorage<TraceContext>());
