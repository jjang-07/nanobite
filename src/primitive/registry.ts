import {loadConfig} from '../config.ts';
import type {Config} from '../config.ts';
import {createPrimitiveClient} from './client.ts';
import {createLocalClient} from './local.ts';
import type {DatabaseSync} from 'node:sqlite';
export function clientForIdentity(identity:string,config:Config=loadConfig(),db?:DatabaseSync) {
 if(identity!==config.REQUESTER_IDENTITY&&identity!==config.RESPONDER_IDENTITY)throw new Error('Unknown local identity');
 if(config.MAIL_PROVIDER==='local'){if(!db)throw new Error('Local mail requires the shared database');return createLocalClient(db,identity);}
 const split=config.PRIMITIVE_API_KEY_REQUESTER&&config.PRIMITIVE_API_KEY_RESPONDER;
 return createPrimitiveClient(split ? (identity===config.REQUESTER_IDENTITY?config.PRIMITIVE_API_KEY_REQUESTER:config.PRIMITIVE_API_KEY_RESPONDER):config.PRIMITIVE_API_KEY);
}
