import {withRetry} from '../acme-sdk/index.ts';
import type {ChargeClient} from '../acme-sdk/index.ts';
export async function chargeCustomer(client:ChargeClient){
 return withRetry(()=>client.charge({amount:4200,currency:'usd',customer:'cus_123'}));
}
