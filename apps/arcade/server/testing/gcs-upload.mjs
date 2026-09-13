import assert from 'node:assert/strict';

// Minimal strict GCS request decoder for storage mocks; preserves binary media.
export async function decodeUpload(raw,options){
 const url=new URL(raw);
 if(url.searchParams.get('uploadType')!=='multipart')return {body:options.body,metadata:{}};
 assert.equal(url.searchParams.get('ifGenerationMatch'),'0');
 const boundary=options.headers['Content-Type'].split('boundary=')[1];
 assert.ok(boundary);
 const bytes=Buffer.from(await new Response(options.body).arrayBuffer()),separator=Buffer.from('\r\n--'+boundary+'\r\n');
 assert.equal(bytes.length,Number(options.headers['Content-Length']));
 const metadataStart=bytes.indexOf('\r\n\r\n')+4,metadataEnd=bytes.indexOf(separator,metadataStart);
 assert.ok(metadataEnd>metadataStart);
 const metadata=JSON.parse(bytes.subarray(metadataStart,metadataEnd).toString());
 assert.equal(metadata.name,url.searchParams.get('name'));
 assert.ok(Number.isFinite(Date.parse(metadata.customTime)));
 const bodyStart=bytes.indexOf('\r\n\r\n',metadataEnd+separator.length)+4;
 const suffix=Buffer.from('\r\n--'+boundary+'--\r\n');
 assert.ok(bytes.subarray(-suffix.length).equals(suffix));
 const body=bytes.subarray(bodyStart,-suffix.length);
 return {body:metadata.contentType==='application/json'?body.toString():new Uint8Array(body),metadata};
}
