import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp.js";
let api:Server;let server:ReturnType<typeof createMcpServer>;let client:Client;let logs:ReturnType<typeof jest.spyOn>;let seen:any[]=[];
beforeEach(async()=>{
 seen=[];logs=jest.spyOn(console,"error").mockImplementation(()=>{});
 api=createServer((req,res)=>{let raw="";req.on("data",chunk=>{raw+=chunk;});req.on("end",()=>{seen.push({url:req.url,headers:req.headers,body:JSON.parse(raw)});res.setHeader("Content-Type","application/json");res.end(JSON.stringify({status:"success",data:{state:"simulated",before:{name:"Donation 1",templateName:"Donation",revision:"before",values:{B1:false},locks:{B1:false}},after:{name:"Donation 1",templateName:"Donation",revision:"after",values:{B1:true},locks:{B1:false}},receipt:{operationId:"op",correlationId:"receipt-id"}}}));});});
 await new Promise<void>(resolve=>api.listen(0,"127.0.0.1",resolve));
 server=createMcpServer({apiKey:"synthetic-key",userEmail:"agent@example.invalid",agentCapability:"synthetic-secret",baseURL:`http://127.0.0.1:${(api.address() as any).port}/api`} as any);
 client=new Client({name:"agent-test",version:"1"});const [ct,st]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(st),client.connect(ct)]);
});
afterEach(async()=>{await client?.close();await server?.close();await new Promise<void>(resolve=>api.close(()=>resolve()));logs.mockRestore();});
it("carries capability only in authenticated HTTP header and returns structured receipt",async()=>{
 const args={teamid:"t",adbid:"d",runId:"run",operationId:"op",input:{adoid:"r",expectedRevision:"rev",values:{B1:true}}};
 const result=await client.callTool({name:"anydb_agent_update_fields",arguments:args});
 expect(result.structuredContent).toMatchObject({state:"simulated",after:{values:{B1:true}},receipt:{operationId:"op",correlationId:"receipt-id"}});
 expect(result.isError).toBeFalsy();expect(JSON.parse((result.content as any)[0].text).state).toBe("simulated");
 expect(seen[0].headers["x-anydb-agent-capability"]).toBe("synthetic-secret");expect(seen[0].headers["x-anydb-api-key"]).toBe("synthetic-key");
 expect(seen[0].url).toBe("/api/integrations/ext/agent/operation");expect(seen[0].body).toEqual({...args,kind:"update_fields"});
 expect(JSON.stringify(logs.mock.calls)).not.toContain("synthetic-secret");
});
it("advertises narrow operations and rejects caller mode and identity injection",async()=>{
 const tools=await client.listTools();expect(tools.tools.filter(t=>t.name.startsWith("anydb_agent_")).map(t=>t.name)).toEqual(["anydb_agent_read_record","anydb_agent_update_fields","anydb_agent_set_cell_lock","anydb_agent_send_email","anydb_agent_create_record","anydb_agent_email_report","anydb_agent_email_document"]);
 const result=await client.callTool({name:"anydb_agent_send_email",arguments:{teamid:"t",adbid:"d",runId:"run",operationId:"op",simulate:false,input:{adoid:"r",expectedRevision:"v",to:["recipient@example.invalid"],subject:"Hello",body:"World"}}});
 expect(result.isError).toBe(true);expect(seen).toEqual([]);
});

it("advertises owning record name and type metadata for authoritative task checks",async()=>{
 const tools=await client.listTools();const read=tools.tools.find(tool=>tool.name==="anydb_agent_read_record")!;
 expect(read.outputSchema?.properties).toMatchObject({name:{type:"string"},templateName:{type:"string"}});
 expect(read.outputSchema?.required).toEqual(expect.arrayContaining(["name","templateName"]));
 expect(read.description).toMatch(/name.*type|type.*name/i);
});


it("exposes narrow child creation through the operation route with stable scope and required reuse policy",async()=>{
 const args={teamid:"t",adbid:"d",runId:"run",operationId:"op",input:{adoid:"parent",expectedRevision:"v",templateId:"approval",name:"Approval",values:{B1:false,A1:0},reuseExisting:true}};
 const result=await client.callTool({name:"anydb_agent_create_record",arguments:args});expect(result.isError).toBeFalsy();
 expect(seen[0].body).toEqual({...args,kind:"create_record"});expect(seen[0].headers["x-anydb-agent-capability"]).toBe("synthetic-secret");
 const rejected=await client.callTool({name:"anydb_agent_create_record",arguments:{...args,executionUserId:"admin"}});expect(rejected.isError).toBe(true);expect(seen).toHaveLength(1);
});
