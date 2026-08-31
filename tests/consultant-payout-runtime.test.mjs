import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('/* === guidcy-supabase-truth-weekly-payouts ===');
const end = source.indexOf('/* === anonymous === */', start);
const payoutLayer = source.slice(start, end);

test('weekly payout action settles every pending booking in one consultant batch', async () => {
  const consultantId = '11111111-1111-4111-8111-111111111111';
  const bookings = [
    // payment_amount is what the client was charged, i.e. the session fee plus the 5%
    // platform fee. A Rs.1,000 fee is collected as Rs.1,050 and pays out Rs.850.
    {id:'booking-1', consultant_id:consultantId, consultant_name:'Test Expert', consultant_email:'expert@example.com', payment_status:'paid', payment_verified:true, payment_amount:1050, payout_status:'pending', created_at:'2026-08-23T00:00:00Z'},
    {id:'booking-2', consultant_id:consultantId, consultant_name:'Test Expert', consultant_email:'expert@example.com', payment_status:'success', payment_verified:true, payment_amount:2100, payout_status:'pending', created_at:'2026-08-23T00:01:00Z'},
    {id:'booking-paid', consultant_id:consultantId, consultant_name:'Test Expert', consultant_email:'expert@example.com', payment_status:'paid', payment_verified:true, payment_amount:100, payout_status:'paid', created_at:'2026-08-20T00:00:00Z'}
  ];
  const consultants = [{id:consultantId, name:'Test Expert', email:'expert@example.com'}];
  const banks = [{consultant_id:consultantId, account_holder_name:'Test Expert', bank_name:'Test Bank', account_number:'1234567890', ifsc_code:'TEST0001234', upi_id:'expert@test', is_verified:true}];
  const logs = [];
  const updatedIds = [];

  function rows(table) {
    if (table === 'bookings') return bookings;
    if (table === 'consultants') return consultants;
    if (table === 'consultant_bank_details') return banks;
    if (table === 'consultant_payout_logs') return logs;
    if (table === 'disputes') return [];
    return [];
  }
  function query(table) {
    const filters = [];
    let mutation = null;
    let mutationValue = null;
    const q = {
      select() { return q; },
      order() { return q; },
      limit() { return q; },
      eq(field, value) { filters.push(row => String(row?.[field]) === String(value)); return q; },
      not() { return q; },
      in(field, values) { filters.push(row => values.map(String).includes(String(row?.[field]))); return q; },
      update(value) { mutation = 'update'; mutationValue = value; return q; },
      insert(value) { mutation = 'insert'; mutationValue = Array.isArray(value) ? value : [value]; return q; },
      then(resolve, reject) {
        try {
          let data = rows(table).filter(row => filters.every(filter => filter(row)));
          if (mutation === 'update') {
            data.forEach(row => { Object.assign(row, mutationValue); updatedIds.push(row.id); });
          }
          if (mutation === 'insert') {
            logs.push(...mutationValue);
            data = mutationValue;
          }
          return Promise.resolve({data, error:null, count:data.length}).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      }
    };
    return q;
  }

  const elements = new Map();
  const main = {dataset:{}, innerHTML:''};
  elements.set('adash-main', main);
  elements.set('guidcy-batch-payout-txn', {value:'UTR-RUNTIME-TEST'});
  elements.set('guidcy-batch-payout-mode', {value:'bank_transfer'});
  elements.set('guidcy-batch-payout-note', {value:'Weekly settlement'});
  elements.set('guidcy-batch-payout-confirm', {disabled:false, textContent:'Confirm Paid'});
  elements.set('guidcy-consultant-batch-modal', {remove(){ elements.delete('guidcy-consultant-batch-modal'); }});

  const client = {
    from: query,
    auth: {getUser: async () => ({data:{user:{id:'22222222-2222-4222-8222-222222222222', email:'admin@example.com'}}})},
    rpc: async () => ({data:[], error:null})
  };
  function classList(){
    const values=new Set();
    return {add(...items){items.forEach(item=>values.add(item))},remove(...items){items.forEach(item=>values.delete(item))},contains(item){return values.has(item)}};
  }
  const body={style:{},classList:classList(),appendChild(el){elements.set(el.id,el)}};
  const documentElement={scrollTop:0,classList:classList()};
  const document = {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({dataset:{}, className:'', innerHTML:'', setAttribute(){}, addEventListener(){}, remove(){elements.delete(this.id)}}),
    documentElement,
    body
  };
  let restoredScrollY=null;
  const window = {
    guidcyGetSupabaseClient: () => client,
    currentUser: {id:'22222222-2222-4222-8222-222222222222', email:'admin@example.com'},
    toast() {},
    addEventListener() {},
    pageYOffset:240,
    scrollTo(x,y){restoredScrollY=y},
    sendGuidcyEmail: async () => true,
    location: {origin:'https://guidcy.com'}
  };
  const context = vm.createContext({window, document, sessionStorage:{setItem(){}}, location:window.location, console, setTimeout, clearTimeout, Map, Promise, Date, Number, String, Array, Math, RegExp});
  vm.runInContext(payoutLayer, context);

  await window.guidcyRenderConsultantPayoutGroups();
  assert.equal(window.__guidcyConsultantPayoutGroups.length, 1);
  assert.equal(window.__guidcyConsultantPayoutGroups[0].pendingBookings, 2);
  // 850 + 1700: 15% commission comes out of the consultant's fee only, never out of
  // the client's platform fee. Charging it on the gross would pay 2677.50 here.
  assert.equal(window.__guidcyConsultantPayoutGroups[0].pending, 2550);
  assert.match(main.innerHTML, /Mark 2 bookings as Paid/);

  window.guidcyOpenConsultantBatchPayout('consultant-weekly-0');
  assert.ok(elements.get('guidcy-consultant-batch-modal'));
  assert.equal(body.classList.contains('guidcy-payout-modal-scroll-lock'),true);
  assert.equal(documentElement.classList.contains('guidcy-payout-modal-scroll-lock'),true);
  assert.equal(body.style.top,'-240px');
  window.guidcyCloseConsultantBatchPayout();
  assert.equal(body.classList.contains('guidcy-payout-modal-scroll-lock'),false);
  assert.equal(documentElement.classList.contains('guidcy-payout-modal-scroll-lock'),false);
  assert.equal(restoredScrollY,240);

  const completed = await window.guidcyConfirmConsultantBatchPayout('consultant-weekly-0');
  assert.equal(completed, true);
  assert.deepEqual(updatedIds.sort(), ['booking-1', 'booking-2']);
  assert.equal(logs.length, 2);
  assert.ok(bookings.slice(0, 2).every(row => row.payout_status === 'paid' && row.payout_transaction_id === 'UTR-RUNTIME-TEST'));
  assert.match(main.innerHTML, /No pending payout/);
  assert.doesNotMatch(main.innerHTML, /Mark \d+ bookings? as Paid/);
});
