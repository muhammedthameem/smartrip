export const categories=['Fuel','Toll','Parking','Food','Driver allowance','Repair','Other'];
const nullable=(type)=>({type:[type,'null']});
export const draftSchema={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['expense','trip','odometer']},name:nullable('string'),date:nullable('string'),amount:nullable('string'),category:{type:['string','null'],enum:[...categories,null]},origin:nullable('string'),destination:nullable('string'),opening_km:nullable('number'),closing_km:nullable('number'),notes:nullable('string'),warnings:{type:'array',items:{type:'string'}}},required:['kind','name','date','amount','category','origin','destination','opening_km','closing_km','notes','warnings']};
export function validateInput(body) {
 if(!body || !['status','scan','draft','assistant','insights','category'].includes(body.action))throw new Error('Unknown AI action.');
 if(body.text!=null && (typeof body.text!=='string'||body.text.length>4000))throw new Error('Use at most 4,000 characters.');
 if(body.action==='scan' && (typeof body.file!=='string'||body.file.length>7100000||!/^data:(image\/(jpeg|png)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(body.file)))throw new Error('Use a JPEG, PNG or PDF up to 5 MB.');
 if(['assistant','insights'].includes(body.action) && (!/^\d{4}-\d{2}-\d{2}$/.test(body.from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(body.to||'')||body.from>body.to))throw new Error('Choose a valid date range.');
 return body;
}
export function extractOutput(response) {
 if(response.status!=='completed')throw new Error('AI could not finish. Try a smaller document or shorter request.');
 const content=(response.output||[]).flatMap(item=>item.content||[]);
 if(content.some(c=>c.type==='refusal'))throw new Error('AI could not process this request. Enter the details manually.');
 const result=content.filter(c=>c.type==='output_text').map(c=>c.text).join('');
 if(!result)throw new Error('AI returned no result. Please retry.');
 return result;
}
