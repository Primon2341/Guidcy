import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const start=source.indexOf('  async function loadWebinarPublisherPhotos(');
const end=source.indexOf('  function webinarPublisherImage(',start);

function mount(profiles, reject=false){
 const queries=[];
 const client={from(table){
 assert.equal(table,'profiles');
 return {select(fields){
 assert.equal(fields,'id,email,avatar_url');
 return {in(field,values){
 queries.push({field,values});
 return reject?Promise.reject(new Error('offline')):Promise.resolve({data:profiles.filter(p=>values.includes(p[field])),error:null});
 }};
 }};
 }};
 return {load:new Function('webinarClient',source.slice(start,end)+';return loadWebinarPublisherPhotos;')(()=>client),queries};
}

test('publisher photos are matched by profile ID, with email for legacy webinars',async()=>{
 const {load,queries}=mount([
 {id:'publisher',email:'publisher@example.com',avatar_url:'/publisher.png'},
 {id:'legacy',email:'legacy@example.com',avatar_url:'/legacy.png'},
 {id:'empty',email:'empty@example.com',avatar_url:''}
 ]);
 const rows=[
 {publisherProfileId:'publisher',publisherEmail:'legacy@example.com'},
 {publisherProfileId:'publisher'},
 {publisherEmail:'LEGACY@example.com'},
 {publisherProfileId:'empty'},
 {publisherProfileId:'missing',publisherEmail:'legacy@example.com'}
 ];
 await load(rows);
 assert.deepEqual(rows.map(w=>w.publisherPhoto),['/publisher.png','/publisher.png','/legacy.png','','']);
 assert.equal(queries.length,2);
 assert.equal(queries[0].values.filter(id=>id==='publisher').length,1);
});

test('missing profile access keeps initials and does not fail webinar loading',async()=>{
 const {load}=mount([],true);
 const rows=[{publisherProfileId:'publisher'}];
 await assert.doesNotReject(load(rows));
 assert.equal(rows[0].publisherPhoto,'');
});
