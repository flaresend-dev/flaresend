/** Convert a local calendar value in an IANA timezone. Reject gaps and ambiguous daylight-saving times. */
export function newsletterScheduleUtc(value:string,timezone:string):string{
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!match)throw new Error("Select a valid date and time.");
 const numbers=match.slice(1).map(Number),[year,month,day,hour,minute]=numbers as [number,number,number,number,number];
 const desired=Date.UTC(year,month-1,day,hour,minute),utc=new Date(desired);
 if(utc.getUTCFullYear()!==year||utc.getUTCMonth()!==month-1||utc.getUTCDate()!==day||hour>23||minute>59)throw new Error("Select a valid date and time.");
 const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const calendar=(time:number)=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));};
 let guess=desired;for(let i=0;i<4;i++){const difference=desired-calendar(guess);if(!difference)break;guess+=difference;}
 if(calendar(guess)!==desired)throw new Error("This time does not exist in this timezone. Select another time.");
 for(let delta=-180;delta<=180;delta+=15)if(delta&&calendar(guess+delta*60000)===desired)throw new Error("This time occurs twice in this timezone. Select another time.");
 return new Date(guess).toISOString();
}
