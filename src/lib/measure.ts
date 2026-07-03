import { createMeasure, configure } from 'measure-fn';

configure({ timestamps: true, maxResultLength: 320 });

export const serverMeasure = createMeasure('server');
export const dbMeasure = createMeasure('db');
export const authMeasure = createMeasure('auth');
export const rpcMeasure = createMeasure('rpc');
