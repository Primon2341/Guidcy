// Legacy entry point delegates to the same authenticated booking-event flow.
Deno.serve(async (req: Request) => {
  const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Content-Type":"application/json"};
  if (req.method === "OPTIONS") return new Response("{}", {headers});
  if (req.method !== "POST") return new Response("{}", {status:405,headers});
  try {
    const payload=await req.json();
    const response=await fetch("https://www.guidcy.com/api/send-guidcy-email", {
      method:"POST",headers:{"Content-Type":"application/json",Authorization:req.headers.get("authorization")||""},
      body:JSON.stringify({type:"booking_confirmation_pair",bookingId:payload.booking_id||payload.bookingId}),redirect:"error",
    });
    return new Response(await response.text(),{status:response.status,headers});
  } catch (_) { return new Response(JSON.stringify({ok:false,error:"Invalid request"}),{status:400,headers}); }
});
