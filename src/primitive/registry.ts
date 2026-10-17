import {loadConfig} from '../config.ts';
import type {Config} from '../config.ts';
import {createPrimitiveClient} from './client.ts';
export function clientForIdentity(identity:string,config:Config=loadConfig()) {
 if(identity!==config.REQUESTER_IDENTITY&&identity!==config.RESPONDER_IDENTITY)throw new Error('Unknown local identity');
 const split=config.PRIMITIVE_API_KEY_REQUESTER&&config.PRIMITIVE_API_KEY_RESPONDER;
 return createPrimitiveClient(split ? (identity===config.REQUESTER_IDENTITY?config.PRIMITIVE_API_KEY_REQUESTER:config.PRIMITIVE_API_KEY_RESPONDER):config.PRIMITIVE_API_KEY);
}
