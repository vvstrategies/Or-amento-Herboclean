import {modelo} from '../utils/proposta.js';
import {defaultFinancialSettings,defaultEstimateInput,snapshotAssumptions,calculateEstimate} from './finance-domain.js';
// Pure authenticated demonstration: no database writes, API calls or real customer records.
export function financialDemo(){
 const company={...modelo.company(),name:'BlueCare',location:'Carapicuíba',phone:'Contato fictício'};
 const q=modelo.quote({company});q.client='Cliente demonstrativo';q.address='Osasco';q.items=[{...modelo.item('Sofá'),quantity:1,price:400}];
 const settings={...defaultFinancialSettings(),defaultMaterialBps:2000,vehicle:{id:'default',name:'Fiat Mobi',fuelType:'gasoline',consumptionCentiKmL:1150,fuelPriceCents:619,additionalCostPerKmCents:30}};
 const assumptions=snapshotAssumptions(settings,company),inputs={...defaultEstimateInput(),manualDistanceMeters:18000};
 return {latest:{version:1,assumptions,inputs,result:calculateEstimate(q,assumptions,inputs),destinationAddressSnapshot:q.address,calculatedAt:new Date().toISOString()},previous:null,currentRevenue:40000,editable:false,stale:false,status:'generated'};
}

