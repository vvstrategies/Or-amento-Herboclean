// No additional infrastructure: opt-in daily work, only while this process is running.
export function startIntegrationScheduler(service){
 let running=false;const tick=async()=>{if(running)return;running=true;try{await service.daily();}catch{/* Failure is retained in safe sync history; never log provider payloads. */}finally{running=false;}};
 const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);
}
