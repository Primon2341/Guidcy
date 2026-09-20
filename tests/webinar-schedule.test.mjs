import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/page-shell.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf(' window.guidcyWebinarSchedule='),source.indexOf(' window.guidcyWebinarEmptyHtml='));
class FixedDate extends Date {static now(){return Date.parse('2026-09-20T14:00:00Z')}}
const schedule=new Function('window','Date',fn+';return window.guidcyWebinarSchedule;')({},FixedDate);
test('public webinars use their actual duration and explicit IST end time',()=>{
 const row={date:'2026-09-20',time:'18:00',duration:'60 minutes'};
 assert.equal(schedule(row).status,'past');
 assert.equal(schedule({...row,time:'19:00'}).status,'live');
 assert.equal(schedule({...row,duration:'2 hours'}).status,'live');
 assert.equal(schedule({...row,duration:'1 hour 30 minutes'}).status,'past','exact end boundary is finished');
 assert.equal(schedule({...row,date:'2026-09-21'}).status,'upcoming');
 assert.equal(schedule(row).start,Date.parse('2026-09-20T12:30:00Z'));
 assert.equal(schedule({date:'bad'}).status,'past','invalid schedules cannot enter the public list');
});
