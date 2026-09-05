(function () {
  'use strict';

  if (window.__GUIDCY_WEBINAR_LIST_PAYMENT_ADMIN_FIX_V1__) return;
  window.__GUIDCY_WEBINAR_LIST_PAYMENT_ADMIN_FIX_V1__ = true;

  var PAYMENT_STATE_KEY = 'guidcy_webinar_payment_v1';
  var publicRegistrationState = {
    webinars: [],
    registrations: [],
    selected: 'all',
    search: '',
    filtered: [],
    loadToken: 0
  };
  var originalBookingPayment = window.guidcyStartRazorpayBooking;
  var originalDoPay = window.doPay;
  var originalPaymentBack = window.guidcyPaymentBack;
  var originalGo = window.go;
  var webinarPaymentBusy = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value)
      .replace(/"/g, '""')
      .replace(/\r?\n/g, ' ') + '"';
  }

  function toast(message, type) {
    try {
      (window.toast || window.showToast || function () {})(message, type || 'blue');
    } catch (_) {}
  }

  function client() {
    try {
      return window.guidcyGetSupabaseClient ? window.guidcyGetSupabaseClient() : window.sb;
    } catch (_) {
      return window.sb || null;
    }
  }

  function currentProfile() {
    try {
      return window.currentProfile || {};
    } catch (_) {
      return {};
    }
  }

  function isAdmin() {
    var profile = currentProfile();
    return lower(profile.role || window.loggedIn) === 'admin' || profile.is_admin === true;
  }

  function money(value) {
    var amount = Number(value || 0);
    return amount > 0 ? '₹' + amount.toLocaleString('en-IN') : 'Free';
  }

  function webinarId(row) {
    return clean(row && (row.id || row.webinar_id));
  }

  function registrationWebinarId(row) {
    return clean(row && (row.webinar_id || row.webinarId || row.wid));
  }

  function webinarTitle(row) {
    return clean(row && (row.title || row.webinar_title || row.name)) || 'Webinar';
  }

  function registrationEmail(row) {
    return lower(row && (row.email || row.user_email || row.registrant_email));
  }

  function isDeletedRegistration(row) {
    return !!(row && (row.is_deleted === true || lower(row.registration_status) === 'deleted'));
  }

  function paymentStatus(row) {
    var value = lower(row && (row.payment_status || row.pay_status));
    if (['success', 'successful', 'paid', 'completed', 'captured'].indexOf(value) >= 0) return 'success';
    if (['failed', 'failure', 'payment_failed'].indexOf(value) >= 0) return 'failed';
    if (['free', 'not_required'].indexOf(value) >= 0) return 'free';
    if (['cancelled', 'canceled'].indexOf(value) >= 0) return 'cancelled';
    if (['refunded', 'refund'].indexOf(value) >= 0) return 'refunded';
    return value || 'pending';
  }

  function registrationStatus(row) {
    if (isDeletedRegistration(row)) return 'deleted';
    var value = lower(row && (row.registration_status || row.status));
    var payment = paymentStatus(row);
    if (['confirmed', 'registered', 'active', 'success', 'paid', 'completed'].indexOf(value) >= 0) return 'confirmed';
    if (['pending', 'pending_payment', 'payment_pending', 'initiated', 'unpaid'].indexOf(value) >= 0) return 'pending_payment';
    if (['failed', 'payment_failed'].indexOf(value) >= 0 || payment === 'failed') return 'payment_failed';
    if (['cancelled', 'canceled'].indexOf(value) >= 0 || payment === 'cancelled') return 'cancelled';
    if (payment === 'success' || payment === 'free') return 'confirmed';
    return value || 'pending_payment';
  }

  function isConfirmedRegistration(row) {
    if (!row || isDeletedRegistration(row)) return false;
    var payment = paymentStatus(row);
    return row.payment_verified === true && (payment === 'success' || payment === 'free') && registrationStatus(row) === 'confirmed';
  }

  function webinarStartsAt(row) {
    var date = clean(row && (row.date || row.webinar_date));
    var time = clean(row && (row.time || row.webinar_time)) || '00:00';
    if (!date) return null;
    var parsed = new Date(date + 'T' + time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function webinarHasEnded(row) {
    var startsAt = webinarStartsAt(row);
    if (!startsAt) return false;
    var durationText = clean(row && (row.duration || row.dur));
    var duration = Number((durationText.match(/\d+/) || [60])[0]) || 60;
    return startsAt.getTime() + duration * 60000 < Date.now();
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return clean(value) || '—';
    }
  }

  function formatTime(value) {
    var parts = clean(value).split(':');
    if (!parts[0]) return '—';
    var hour = Number(parts[0]);
    var minute = parts[1] || '00';
    var suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return hour + ':' + minute + ' ' + suffix + ' IST';
  }

  async function selectRows(table, orderColumn, ascending) {
    var database = client();
    if (database && database.from) {
      var query = database.from(table).select('*');
      if (orderColumn && query.order) query = query.order(orderColumn, { ascending: ascending !== false });
      var response = await query;
      if (!response.error && Array.isArray(response.data)) return response.data;
      if (response.error) throw response.error;
    }
    if (typeof window.supabaseRest === 'function') {
      var path = table + '?select=*';
      if (orderColumn) path += '&order=' + encodeURIComponent(orderColumn + '.' + (ascending === false ? 'desc' : 'asc'));
      var restResponse = await window.supabaseRest(path, { method: 'GET', timeoutMs: 15000 });
      if (restResponse && restResponse.ok && Array.isArray(restResponse.data)) return restResponse.data;
      throw new Error((restResponse && (restResponse.raw || restResponse.error)) || 'Unable to load ' + table);
    }
    throw new Error('Webinar data service is unavailable.');
  }

  async function webinarById(id) {
    var database = client();
    if (!database || !database.from) throw new Error('Webinar data service is unavailable.');
    var response = await database.from('webinars').select('*').eq('id', id).maybeSingle();
    if (response.error) throw response.error;
    return response.data || null;
  }

  async function findActiveRegistration(id, email) {
    var database = client();
    if (!database || !database.from) throw new Error('Webinar registration service is unavailable.');
    var query = database.from('webinar_registrations')
      .select('*')
      .eq('webinar_id', id)
      .ilike('email', email);
    if (query.order) query = query.order('registered_at', { ascending: false });
    if (query.limit) query = query.limit(20);
    var response = await query;
    if (response.error) throw response.error;
    return (response.data || []).find(function (row) {
      return !isDeletedRegistration(row) && registrationEmail(row) === lower(email);
    }) || null;
  }

  async function updateRegistration(id, patch) {
    var database = client();
    if (!database || !database.from) throw new Error('Webinar registration service is unavailable.');
    var response = await database.from('webinar_registrations')
      .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (response.error) throw response.error;
    return response.data || Object.assign({ id: id }, patch);
  }

  async function prepareRegistration(webinar, details, paid) {
    var amount = paid ? Number(webinar.price_amount || webinar.priceAmount || webinar.price || 0) : 0;
    var existing = await findActiveRegistration(webinar.id, details.email);
    if (existing && isConfirmedRegistration(existing)) {
      existing.__alreadyConfirmed = true;
      return existing;
    }
    var patch = {
      webinar_id: webinar.id,
      webinar_title: webinarTitle(webinar),
      name: details.name,
      email: lower(details.email),
      phone: details.phone,
      role: details.role,
      goal: details.goal,
      amount_paid: amount,
      payment_amount: amount,
      payment_gateway: paid ? 'razorpay' : 'free',
      payment_status: paid ? 'pending' : 'free',
      registration_status: paid ? 'pending_payment' : 'confirmed',
      payment_verified: !paid,
      is_deleted: false
    };
    if (existing && existing.id) return updateRegistration(existing.id, patch);
    var database = client();
    var row = Object.assign({
      id: 'REG-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
      registered_at: new Date().toISOString()
    }, patch);
    var response = await database.from('webinar_registrations').insert(row).select('*').single();
    if (response.error && String(response.error.code) === '23505') {
      var raced = await findActiveRegistration(webinar.id, details.email);
      if (raced) return raced;
    }
    if (response.error) throw response.error;
    return response.data;
  }

  async function postJson(url, body) {
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var text = await response.text();
    var data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text };
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || text || ('HTTP ' + response.status));
    return data;
  }

  function paymentState() {
    if (window.__guidcyWebinarPaymentState) return window.__guidcyWebinarPaymentState;
    try {
      var saved = JSON.parse(sessionStorage.getItem(PAYMENT_STATE_KEY) || 'null');
      if (saved && saved.registration && saved.webinar) {
        window.__guidcyWebinarPaymentState = saved;
        return saved;
      }
    } catch (_) {}
    return null;
  }

  function savePaymentState(state) {
    window.__guidcyWebinarPaymentState = state;
    try {
      sessionStorage.setItem(PAYMENT_STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function clearPaymentState() {
    window.__guidcyWebinarPaymentState = null;
    try {
      sessionStorage.removeItem(PAYMENT_STATE_KEY);
    } catch (_) {}
  }

  function setPaymentStatus(kind, title, detail) {
    if (typeof window.guidcySetPaymentPageStatus === 'function') {
      window.guidcySetPaymentPageStatus(kind, title, detail);
      return;
    }
    var box = byId('guidcy-payment-status');
    if (!box) return;
    box.hidden = false;
    box.className = 'guidcy-payment-status ' + kind;
    box.innerHTML = '<strong>' + escapeHtml(title) + '</strong>' + (detail ? '<span>' + escapeHtml(detail) + '</span>' : '');
  }

  function renderWebinarPaymentPage() {
    var state = paymentState();
    if (!state || !state.webinar || !state.registration) return;
    var webinar = state.webinar;
    var details = state.details || {};
    var amount = Number(webinar.price_amount || webinar.priceAmount || webinar.price || state.amount || 0);
    var amountNode = byId('pay-amt');
    var description = byId('pay-desc');
    var summary = byId('pay-summary-box');
    var button = document.querySelector('#page-payment .green-btn');
    if (amountNode) amountNode.textContent = money(amount);
    if (description) description.textContent = 'Webinar registration · ' + webinarTitle(webinar);
    if (summary) {
      summary.innerHTML = [
        ['Webinar', webinarTitle(webinar)],
        ['Date', formatDate(webinar.date || webinar.webinar_date)],
        ['Time', formatTime(webinar.time || webinar.webinar_time)],
        ['Registrant', details.name || state.registration.name || '—'],
        ['Email', details.email || state.registration.email || '—'],
        ['Registration ID', state.registration.id]
      ].map(function (row) {
        return '<div class="detail-row"><span style="color:var(--muted)">' + escapeHtml(row[0]) + '</span><span style="font-weight:600;text-align:right">' + escapeHtml(row[1]) + '</span></div>';
      }).join('');
    }
    if (button) {
      button.type = 'button';
      button.dataset.webinarPayment = '1';
      button.disabled = webinarPaymentBusy || state.completed === true;
      button.textContent = state.completed ? 'Payment complete' : (webinarPaymentBusy ? 'Processing payment...' : 'Pay ' + money(amount) + ' & register');
    }
    var secure = document.querySelector('#page-payment .secure-row');
    if (secure && secure.dataset.webinarCopy !== '1') {
      secure.dataset.webinarCopy = '1';
      secure.innerHTML = '🔒 Razorpay secure payment · Webinar registration saved only after verified success';
    }
  }

  function ensurePaymentPage() {
    if (typeof window.guidcyEnsurePaymentPageOnly === 'function') {
      window.guidcyEnsurePaymentPageOnly();
    } else {
      document.querySelectorAll('.page').forEach(function (page) {
        page.classList.remove('on', 'active');
      });
      var paymentPage = byId('page-payment');
      if (paymentPage) paymentPage.classList.add('on');
    }
    if (!/^\/payment\/?$/.test(location.pathname || '')) {
      try {
        History.prototype.pushState.call(history, { page: 'payment', flow: 'webinar' }, '', '/payment');
      } catch (_) {}
    }
    try {
      window.scrollTo(0, 0);
      window.guidcyPlaceFooterAfterPages && window.guidcyPlaceFooterAfterPages();
    } catch (_) {}
    renderWebinarPaymentPage();
  }

  function openWebinarPaymentPage(webinar, registration, details) {
    var state = {
      flow: 'webinar',
      webinar: webinar,
      registration: registration,
      details: details,
      amount: Number(webinar.price_amount || webinar.priceAmount || webinar.price || 0),
      blocking: true,
      completed: false,
      openedAt: Date.now()
    };
    savePaymentState(state);
    window.__guidcyPaymentFlowLock = true;
    try {
      window.wbnCloseModal && window.wbnCloseModal();
    } catch (_) {}
    ensurePaymentPage();
    [80, 260, 700].forEach(function (delay) {
      setTimeout(function () {
        if (paymentState()) ensurePaymentPage();
      }, delay);
    });
    setPaymentStatus('ready', 'Ready for secure payment', 'Review the webinar details, then click Pay & register.');
  }

  async function sendWebinarEmails(registration, webinar) {
    if (!registration || registration.registration_email_sent === true || registration.confirmation_email_sent === true) return;
    var base = Object.assign({}, registration, {
      webinar_date: webinar.date || webinar.webinar_date,
      webinar_time: webinar.time || webinar.webinar_time,
      host_name: webinar.speaker || webinar.host_name,
      action_link: location.origin + '/webinars'
    });
    var sends = [];
    if (typeof window.sendGuidcyEmail === 'function') {
      sends.push(window.sendGuidcyEmail({
        to: registration.email,
        recipientName: registration.name || 'User',
        recipientRole: 'user',
        type: 'webinar_registration_user',
        relatedTable: 'webinar_registrations',
        relatedId: registration.id,
        data: base
      }));
      var hostEmail = clean(webinar.publisher_email || webinar.host_email || webinar.consultant_email);
      if (hostEmail) {
        sends.push(window.sendGuidcyEmail({
          to: hostEmail,
          recipientName: webinar.speaker || webinar.host_name || 'Consultant',
          recipientRole: 'consultant',
          type: 'webinar_registration_consultant',
          relatedTable: 'webinar_registrations',
          relatedId: registration.id,
          data: Object.assign({}, base, {
            registrant_name: registration.name,
            registrant_email: registration.email,
            action_link: location.origin + '/consultant-dashboard'
          })
        }));
      }
      sends.push(window.sendGuidcyEmail({
        recipientRole: 'admin',
        type: 'new_webinar_registration_admin',
        relatedTable: 'webinar_registrations',
        relatedId: registration.id,
        data: Object.assign({}, base, {
          registrant_name: registration.name,
          registrant_email: registration.email
        })
      }));
    } else if (typeof window.sendWebinarConfirmationEmail === 'function') {
      sends.push(window.sendWebinarConfirmationEmail(registration.id, base));
    }
    if (!sends.length) return;
    var results = await Promise.allSettled(sends);
    if (results[0] && results[0].status === 'fulfilled') {
      try {
        await updateRegistration(registration.id, {
          registration_email_sent: true,
          registration_email_sent_at: new Date().toISOString(),
          confirmation_email_sent: true,
          confirmation_email_sent_at: new Date().toISOString()
        });
      } catch (_) {}
    }
  }

  function showWebinarConfirmation(registration, webinar, alreadyRegistered) {
    var old = byId('booking-confirm-popup');
    if (old) old.remove();
    var popup = document.createElement('div');
    popup.id = 'booking-confirm-popup';
    popup.className = 'modal-overlay guidcy-payment-confirmation on';
    popup.dataset.paymentOutcome = 'success';
    popup.dataset.paymentFlow = 'webinar';
    popup.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="guidcy-webinar-payment-confirm-title" style="max-width:520px;text-align:center">' +
      '<button class="modal-close" type="button" aria-label="Stay on Payment page" onclick="guidcyWebinarPaymentOutcomeAction(\'stay\')">×</button>' +
      '<div style="width:74px;height:74px;border-radius:50%;background:var(--green-l);border:2px solid var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:34px">✓</div>' +
      '<div id="guidcy-webinar-payment-confirm-title" style="font-family:\'Cormorant Garamond\',serif;font-size:30px;font-weight:600;color:var(--ink);margin-bottom:8px">' +
      (alreadyRegistered ? 'You are already registered' : 'Payment successful') + '</div>' +
      '<div style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:18px">' +
      (alreadyRegistered
        ? 'This webinar is already paid for with ' + escapeHtml(registration.email || 'this email') + ', so no new payment was taken and Razorpay was not opened.'
        : 'Your webinar registration is confirmed. Choose an action below when you are ready.') + '</div>' +
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);padding:14px;text-align:left;margin-bottom:18px">' +
      '<div class="detail-row"><span style="color:var(--muted)">Webinar</span><span style="font-weight:600;text-align:right">' + escapeHtml(webinarTitle(webinar)) + '</span></div>' +
      '<div class="detail-row"><span style="color:var(--muted)">Date</span><span>' + escapeHtml(formatDate(webinar.date || webinar.webinar_date)) + '</span></div>' +
      '<div class="detail-row"><span style="color:var(--muted)">Time</span><span>' + escapeHtml(formatTime(webinar.time || webinar.webinar_time)) + '</span></div>' +
      '<div class="detail-row"><span style="color:var(--muted)">Registration ID</span><span style="word-break:break-all;text-align:right">' + escapeHtml(registration.id) + '</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button class="btn btn-blue" type="button" onclick="guidcyWebinarPaymentOutcomeAction(\'webinars\')">View webinars</button>' +
      '<button class="btn" type="button" onclick="guidcyWebinarPaymentOutcomeAction(\'stay\')">Stay on Payment page</button>' +
      '</div></div>';
    document.body.appendChild(popup);
  }

  window.guidcyWebinarPaymentOutcomeAction = function (action) {
    var popup = byId('booking-confirm-popup');
    if (popup) popup.remove();
    if (action === 'webinars') {
      clearPaymentState();
      window.__guidcyPaymentFlowLock = false;
      if (typeof originalGo === 'function') originalGo.call(window, 'webinar');
      else location.href = '/webinars';
      return;
    }
    var state = paymentState();
    if (state) {
      state.blocking = false;
      savePaymentState(state);
    }
    window.__guidcyPaymentFlowLock = false;
    ensurePaymentPage();
  };

  async function markUnsuccessfulRegistration(state, status) {
    if (!state || !state.registration || !state.registration.id) return;
    try {
      state.registration = await updateRegistration(state.registration.id, {
        payment_status: status,
        registration_status: status === 'cancelled' ? 'cancelled' : 'payment_failed',
        payment_verified: false,
        razorpay_status: status
      });
      savePaymentState(state);
    } catch (error) {
      console.warn('Unable to persist unsuccessful webinar payment state:', error);
    }
  }

  async function startWebinarPayment() {
    var state = paymentState();
    if (!state || !state.webinar || !state.registration) {
      setPaymentStatus('error', 'Webinar payment details expired', 'Return to Webinars and start the registration again.');
      return;
    }
    if (webinarPaymentBusy || state.completed) return;
    webinarPaymentBusy = true;
    state.blocking = true;
    savePaymentState(state);
    window.__guidcyPaymentFlowLock = true;
    ensurePaymentPage();
    setPaymentStatus('processing', 'Opening secure checkout', 'Stay on this Payment page while Razorpay processes the registration.');
    renderWebinarPaymentPage();
    var checkoutCompleted = false;
    var alreadyRegistered = false;
    try {
      var created = await postJson('/api/create-order', {
        flow: 'webinar',
        registrationId: state.registration.id
      });
      if (created.alreadyPaid && created.row) {
        state.registration = created.row;
        alreadyRegistered = true;
      } else {
        if (!created.order || !/^order_[A-Za-z0-9]+$/.test(clean(created.order.id))) {
          throw new Error('Unable to create the Razorpay webinar order.');
        }
        if (typeof window.guidcyOpenRazorpayCheckout !== 'function') {
          throw new Error('Razorpay checkout is still loading. Please try again.');
        }
        ensurePaymentPage();
        var response = await window.guidcyOpenRazorpayCheckout({
          keyId: created.keyId,
          order: created.order,
          description: 'Guidcy webinar · ' + webinarTitle(state.webinar),
          prefill: {
            name: state.details.name || state.registration.name || '',
            email: state.details.email || state.registration.email || '',
            contact: state.details.phone || state.registration.phone || ''
          },
          notes: {
            flow: 'webinar',
            registration_id: state.registration.id,
            webinar_id: webinarId(state.webinar)
          }
        });
        checkoutCompleted = true;
        ensurePaymentPage();
        setPaymentStatus('processing', 'Verifying payment', 'The registration will be confirmed only after server-side Razorpay verification.');
        var verified = await postJson('/api/verify-payment', Object.assign({
          flow: 'webinar',
          registrationId: state.registration.id
        }, response));
        state.registration = verified.registration || state.registration;
      }
      if (!isConfirmedRegistration(state.registration)) {
        throw new Error('Payment was not verified. The webinar registration remains unconfirmed.');
      }
      state.completed = true;
      state.blocking = true;
      savePaymentState(state);
      window.lastWebinarRegistration = state.registration;
      ensurePaymentPage();
      setPaymentStatus('success',
        alreadyRegistered ? 'Already registered' : 'Payment successful',
        alreadyRegistered
          ? 'This webinar was already paid for with this email. No new payment was taken.'
          : 'Your webinar registration is confirmed. Choose an action from the confirmation popup.');
      renderWebinarPaymentPage();
      try {
        await sendWebinarEmails(state.registration, state.webinar);
      } catch (emailError) {
        console.warn('Webinar confirmation email failed:', emailError);
      }
      try {
        window.wbnLoad && await window.wbnLoad();
        window.wbnRenderRegs && window.wbnRenderRegs();
      } catch (_) {}
      showWebinarConfirmation(state.registration, state.webinar, alreadyRegistered);
    } catch (error) {
      console.error('Webinar Razorpay payment failed:', error);
      state.blocking = false;
      savePaymentState(state);
      window.__guidcyPaymentFlowLock = false;
      ensurePaymentPage();
      if (error && error.cancelled) {
        await markUnsuccessfulRegistration(state, 'cancelled');
        setPaymentStatus('cancelled', 'Payment cancelled', 'The webinar registration was not confirmed or marked as paid. You can retry from this page.');
      } else {
        if (!checkoutCompleted) await markUnsuccessfulRegistration(state, 'failed');
        setPaymentStatus('error', checkoutCompleted ? 'Payment verification incomplete' : 'Payment failed', (error && error.message) || 'The webinar registration was not confirmed.');
      }
      toast(error && error.cancelled ? 'Payment cancelled. Registration was not confirmed.' : ((error && error.message) || 'Unable to complete webinar payment.'), error && error.cancelled ? 'blue' : 'red');
    } finally {
      webinarPaymentBusy = false;
      renderWebinarPaymentPage();
    }
  }

  function registrationFormDetails() {
    return {
      name: clean(byId('wbn-reg-name') && byId('wbn-reg-name').value),
      email: lower(byId('wbn-reg-email') && byId('wbn-reg-email').value),
      phone: clean(byId('wbn-reg-phone') && byId('wbn-reg-phone').value),
      role: clean(byId('wbn-reg-role') && byId('wbn-reg-role').value),
      goal: clean(byId('wbn-reg-goal') && byId('wbn-reg-goal').value)
    };
  }

  async function submitWebinarRegistration() {
    if (window.__guidcyWebinarRegistrationBusy) return;
    var id = clean(window.__guidcyCurrentWebinarId);
    var details = registrationFormDetails();
    if (!id) {
      toast('No webinar selected.', 'red');
      return;
    }
    if (!details.name || !details.email || !details.phone) {
      toast('Please fill in name, email and phone.', 'red');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
      toast('Please enter a valid email address.', 'red');
      return;
    }
    var button = byId('wbn-reg-form') && byId('wbn-reg-form').querySelector('.btn-blue');
    window.__guidcyWebinarRegistrationBusy = true;
    var paid = false;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Preparing registration...';
      }
      var webinar = await webinarById(id);
      if (!webinar) throw new Error('Webinar is no longer available.');
      if (webinarHasEnded(webinar)) throw new Error('This webinar has already ended.');
      paid = webinar.is_paid === true || lower(webinar.price_type) === 'paid' || Number(webinar.price_amount || 0) > 0;
      var registration = await prepareRegistration(webinar, details, paid);
      if (paid) {
        /* Already paid for with this email. Sending them to the payment page and
           then popping "Payment successful" read as a charge that never happened -
           Razorpay is not opened here, and nothing is taken. Say so where they
           already are, in the registration form, and leave the payment flow out
           of it entirely. */
        if (registration.__alreadyConfirmed || isConfirmedRegistration(registration)) {
          clearPaymentState();
          window.__guidcyPaymentFlowLock = false;
          var regForm = byId('wbn-reg-form');
          var regSuccess = byId('wbn-reg-success');
          var regMessage = byId('wbn-reg-success-msg');
          if (regForm) regForm.style.display = 'none';
          if (regSuccess) regSuccess.classList.add('on');
          if (regMessage) {
            regMessage.textContent = 'You are already registered for "' + webinarTitle(webinar) +
              '". It is already paid for with ' + (registration.email || details.email) +
              ', so no new payment was taken. The meeting link will be sent before the session.';
          }
          toast('You are already registered for this webinar.', 'blue');
          return;
        }
        openWebinarPaymentPage(webinar, registration, details);
        return;
      }
      var freeResult = await postJson('/api/verify-payment', {
        flow: 'webinar',
        registrationId: registration.id,
        free: true
      });
      registration = freeResult.registration || registration;
      if (!isConfirmedRegistration(registration)) throw new Error('Free registration could not be confirmed.');
      await sendWebinarEmails(registration, webinar);
      var form = byId('wbn-reg-form');
      var success = byId('wbn-reg-success');
      var message = byId('wbn-reg-success-msg');
      if (form) form.style.display = 'none';
      if (success) success.classList.add('on');
      if (message) message.textContent = 'You registered for "' + webinarTitle(webinar) + '". The meeting link will be sent before the session.';
      toast('Registration confirmed.', 'green');
      try {
        window.wbnLoad && await window.wbnLoad();
        window.wbnRenderRegs && window.wbnRenderRegs();
      } catch (_) {}
    } catch (error) {
      console.error('Webinar registration failed:', error);
      toast((error && error.message) || 'Unable to complete webinar registration.', 'red');
    } finally {
      window.__guidcyWebinarRegistrationBusy = false;
      if (button) {
        button.disabled = false;
        button.textContent = paid ? 'Continue to payment' : 'Confirm registration';
      }
    }
  }

  var originalOpenRegistration = window.wbnOpenReg;
  if (typeof originalOpenRegistration === 'function') {
    window.wbnOpenReg = function (id) {
      window.__guidcyCurrentWebinarId = id;
      return originalOpenRegistration.apply(this, arguments);
    };
  }
  window.wbnSubmitReg = submitWebinarRegistration;
  window.wbnSubmitReg.__guidcyPaymentPageFlow = true;
  /* app.js wraps wbnSubmitReg to fire the registration emails the moment the submit
     resolves - which for a paid webinar is before any payment, so the attendee was
     told "You are registered" while the registration was still pending_payment.
     That wrapper skips any submit already marked as running a verified-payment
     flow, which this one does: sendWebinarEmails() sends the same three emails
     (attendee, host, admin) only after server-side verification. */
  window.wbnSubmitReg.__guidcyVerifiedPaymentFlow = true;

  window.guidcyStartRazorpayBooking = function () {
    if (paymentState()) return startWebinarPayment();
    if (typeof originalBookingPayment === 'function') return originalBookingPayment.apply(this, arguments);
  };
  window.doPay = function () {
    if (paymentState()) return startWebinarPayment();
    if (typeof originalDoPay === 'function') return originalDoPay.apply(this, arguments);
    if (typeof originalBookingPayment === 'function') return originalBookingPayment.apply(this, arguments);
  };
  try {
    guidcyStartRazorpayBooking = window.guidcyStartRazorpayBooking;
    doPay = window.doPay;
  } catch (_) {}

  window.guidcyPaymentBack = function () {
    var state = paymentState();
    if (!state) {
      if (typeof originalPaymentBack === 'function') return originalPaymentBack.apply(this, arguments);
      return history.back();
    }
    if (webinarPaymentBusy) {
      ensurePaymentPage();
      return;
    }
    clearPaymentState();
    window.__guidcyPaymentFlowLock = false;
    if (typeof originalGo === 'function') return originalGo.call(window, 'webinar');
    location.href = '/webinars';
  };

  /* The whole payment state was persisted to sessionStorage with nothing to
     expire it, so it could be replayed days later. Two ways that broke:

     - A finished payment kept completed:true, so loading /payment re-showed
       "Payment successful" for an old registration, and startWebinarPayment
       returned early on `state.completed` - the Pay button never opened
       Razorpay. Even when it did run, it reused the old registration id, so
       /api/create-order answered alreadyPaid and the client jumped straight to
       the success popup without charging anything.
     - blocking:true was only cleared by pressing Back on the payment page or by
       cancelling a checkout that had actually started, so a user who simply
       navigated away or reloaded stayed blocked and every later go() in the tab
       was redirected to /payment. Each redirect re-ran ensurePaymentPage(),
       which re-homes the footer against whichever page was active at that
       instant - which is how the footer ended up above the content.

     So: drop anything stale, keep only a genuinely fresh state, and never let a
     persisted blocking flag survive into a new document (nothing is in flight in
     a document that has only just loaded). */
  var WEBINAR_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;
  try {
    var bootState = paymentState();
    if (bootState) {
      var openedAt = Number(bootState.openedAt || 0);
      var stale = !openedAt || (Date.now() - openedAt) > WEBINAR_PAYMENT_MAX_AGE_MS;
      if (stale) {
        /* Includes a completed payment from an earlier visit: the registration is
           already recorded server-side, and replaying it only produces a false
           confirmation and blocks the next payment. */
        clearPaymentState();
        window.__guidcyPaymentFlowLock = false;
      } else if (bootState.blocking && !bootState.completed) {
        bootState.blocking = false;
        savePaymentState(bootState);
      }
    }
  } catch (_) {}

  if (typeof originalGo === 'function') {
    window.go = function (page) {
      var state = paymentState();
      if (state && state.blocking && page !== 'payment') {
        ensurePaymentPage();
        return 'webinar_payment_locked';
      }
      if (state && !state.blocking && page !== 'payment') clearPaymentState();
      return originalGo.apply(this, arguments);
    };
    try {
      go = window.go;
    } catch (_) {}
  }

  function activateWebinarRegistrationDashboard() {
    var adminPage = byId('page-admin-dash');
    if (!adminPage) return;
    if (!adminPage.classList.contains('on') && !adminPage.classList.contains('active')) {
      window.__guidcyForceRenderOnce = true;
      if (typeof window.renderPage === 'function') window.renderPage('admin-dash');
    }
    if (!adminPage.classList.contains('on') && !adminPage.classList.contains('active')) {
      document.querySelectorAll('.page.on,.page.active').forEach(function (page) {
        page.classList.remove('on', 'active');
      });
      adminPage.classList.add('on');
    }
  }

  function renderWebinarRegistrationDashboard() {
    activateWebinarRegistrationDashboard();
    if (typeof window.swAD === 'function') {
      window.swAD('webinar-registrations', null);
    } else if (typeof window.guidcyRenderWebinarRegistrationsAdmin === 'function') {
      window.guidcyRenderWebinarRegistrationsAdmin();
    }
    window.scrollTo(0, 0);
  }

  window.guidcyOpenWebinarRegistrations = function (event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!isAdmin()) {
      toast('Admin login required to view webinar registrations.', 'red');
      if (typeof originalGo === 'function') originalGo.call(window, 'login');
      else location.href = '/login';
      return false;
    }

    document.querySelectorAll('#wbn-reg-modal,.wbn-modal-overlay,.wbn-delete-modal').forEach(function (overlay) {
      overlay.classList.remove('on', 'is-open', 'open');
      overlay.style.display = 'none';
    });
    try {
      sessionStorage.setItem('guidcy_admin_dash_tab', 'webinar-registrations');
      sessionStorage.setItem('guidcy_admin_dash_view', 'webinar-registrations');
    } catch (_) {}

    var target = '/admin/webinar-registrations';
    if (typeof window.__GUIDCY_SET_ROUTE_INTENT_V6__ === 'function') {
      window.__GUIDCY_SET_ROUTE_INTENT_V6__(target);
    }
    if ((location.pathname || '').replace(/\/+$/, '') !== target) {
      history.pushState({ page: 'admin-dash', tab: 'webinar-registrations' }, '', target);
    }

    if (typeof window.guidcyRefreshRouteFromLocation === 'function') {
      window.guidcyRefreshRouteFromLocation();
    } else {
      renderWebinarRegistrationDashboard();
    }

    var finish = function () {
      var adminPage = byId('page-admin-dash');
      var main = byId('adash-main');
      var title = lower(main && main.querySelector('.dash-title') && main.querySelector('.dash-title').textContent);
      if (!adminPage || (!adminPage.classList.contains('on') && !adminPage.classList.contains('active')) || title !== 'webinar registrations') {
        renderWebinarRegistrationDashboard();
      } else {
        window.scrollTo(0, 0);
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else setTimeout(finish, 0);
    return false;
  };

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('#wbn-manage-regs-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.guidcyOpenWebinarRegistrations(event);
  }, true);

  function dedupeWebinars(rows) {
    var seen = {};
    return (rows || []).filter(function (row) {
      var id = webinarId(row);
      if (!id || seen[id]) return false;
      seen[id] = true;
      return row.is_deleted !== true && lower(row.status || row.publish_status || row.webinar_status) !== 'deleted';
    });
  }

  function dedupeRegistrations(rows) {
    var byKey = {};
    (rows || []).forEach(function (row) {
      var key = clean(row.id) || [registrationWebinarId(row), registrationEmail(row), clean(row.registered_at || row.created_at)].join('|');
      if (!key) return;
      if (!byKey[key] || new Date(row.updated_at || row.registered_at || 0) >= new Date(byKey[key].updated_at || byKey[key].registered_at || 0)) {
        byKey[key] = row;
      }
    });
    return Object.keys(byKey).map(function (key) { return byKey[key]; });
  }

  function publicFilteredRegistrations() {
    var selected = publicRegistrationState.selected;
    var query = lower(publicRegistrationState.search);
    var webinarMap = new Map(publicRegistrationState.webinars.map(function (row) {
      return [webinarId(row), row];
    }));
    return publicRegistrationState.registrations.filter(function (row) {
      if (isDeletedRegistration(row)) return false;
      if (selected !== 'all' && registrationWebinarId(row) !== selected) return false;
      if (!query) return true;
      var webinar = webinarMap.get(registrationWebinarId(row));
      return lower([
        webinarTitle(webinar) || row.webinar_title,
        row.name,
        row.email,
        row.phone,
        row.role,
        paymentStatus(row),
        registrationStatus(row)
      ].join(' ')).indexOf(query) >= 0;
    });
  }

  function syncPublicRegistrationControls() {
    var select = byId('wbn-regs-webinar-filter');
    if (select) {
      var selected = publicRegistrationState.selected || 'all';
      select.innerHTML = '<option value="all">All Webinars</option>' + publicRegistrationState.webinars.map(function (row) {
        return '<option value="' + escapeHtml(webinarId(row)) + '">' + escapeHtml(webinarTitle(row)) + '</option>';
      }).join('');
      select.value = publicRegistrationState.webinars.some(function (row) { return webinarId(row) === selected; }) ? selected : 'all';
      publicRegistrationState.selected = select.value;
    }
    var search = byId('wbn-regs-search');
    if (search && search.value !== publicRegistrationState.search) search.value = publicRegistrationState.search;
  }

  function renderPublicRegistrations() {
    syncPublicRegistrationControls();
    var rows = publicFilteredRegistrations();
    publicRegistrationState.filtered = rows;
    var webinar = publicRegistrationState.webinars.find(function (row) {
      return webinarId(row) === publicRegistrationState.selected;
    });
    var selectedTitle = publicRegistrationState.selected === 'all' ? 'All registrations' : webinarTitle(webinar);
    var heading = byId('wbn-regs-heading');
    var count = byId('wbn-regs-count');
    var list = byId('wbn-regs-list');
    var exportButton = byId('wbn-regs-export-btn');
    if (heading) heading.textContent = selectedTitle;
    if (count) count.textContent = (publicRegistrationState.selected === 'all' ? 'All registrations · ' : selectedTitle + ' · ') + rows.length + ' registration' + (rows.length === 1 ? '' : 's');
    if (exportButton) exportButton.textContent = publicRegistrationState.selected === 'all' ? 'Export all registrations' : 'Export selected webinar';
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<div class="guidcy-wbn-reg-empty">No registrations found for the selected webinar/filter.</div>';
      return;
    }
    var webinarMap = new Map(publicRegistrationState.webinars.map(function (row) {
      return [webinarId(row), row];
    }));
    list.innerHTML = '<div class="guidcy-wbn-reg-table-wrap"><table class="guidcy-wbn-reg-table"><thead><tr><th>Webinar</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Payment</th><th>Status</th><th>Registered at</th></tr></thead><tbody>' + rows.map(function (row) {
      var linkedWebinar = webinarMap.get(registrationWebinarId(row));
      return '<tr data-webinar-id="' + escapeHtml(registrationWebinarId(row)) + '"><td><strong>' + escapeHtml(clean(row.webinar_title) || webinarTitle(linkedWebinar)) + '</strong></td><td>' + escapeHtml(row.name || '—') + '</td><td class="subtle">' + escapeHtml(row.email || '—') + '</td><td class="subtle">' + escapeHtml(row.phone || '—') + '</td><td class="subtle">' + escapeHtml(row.role || '—') + '</td><td class="subtle">' + escapeHtml(paymentStatus(row)) + '</td><td class="subtle">' + escapeHtml(registrationStatus(row).replace(/_/g, ' ')) + '</td><td style="white-space:nowrap">' + escapeHtml(formatDate(row.registered_at || row.created_at)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function loadPublicRegistrations() {
    if (!isAdmin()) return [];
    var token = ++publicRegistrationState.loadToken;
    var count = byId('wbn-regs-count');
    if (count) count.textContent = 'Loading registrations…';
    try {
      var results = await Promise.all([
        selectRows('webinars', 'created_at', false),
        selectRows('webinar_registrations', 'registered_at', false)
      ]);
      if (token !== publicRegistrationState.loadToken) return [];
      publicRegistrationState.webinars = dedupeWebinars(results[0]);
      publicRegistrationState.registrations = dedupeRegistrations(results[1]);
      renderPublicRegistrations();
      return publicRegistrationState.filtered;
    } catch (error) {
      console.error('Unable to load webinar registrations:', error);
      if (count) count.textContent = 'Unable to load registrations';
      var list = byId('wbn-regs-list');
      if (list) list.innerHTML = '<div class="guidcy-wbn-reg-empty">Unable to load current webinar registrations. Please try again.</div>';
      return [];
    }
  }

  function exportRegistrationRows(rows, selectedId, webinars) {
    if (!rows.length) {
      toast('No registrations to export.', 'red');
      return;
    }
    var webinarMap = new Map((webinars || []).map(function (row) {
      return [webinarId(row), row];
    }));
    var headers = ['Webinar title', 'Webinar ID', 'Registrant name', 'Registrant email', 'Phone number', 'Role', 'Payment status', 'Registration status', 'Registered at', 'Amount paid', 'Transaction ID'];
    var csvRows = rows.map(function (row) {
      var linkedWebinar = webinarMap.get(registrationWebinarId(row));
      return [
        clean(row.webinar_title) || webinarTitle(linkedWebinar),
        registrationWebinarId(row),
        row.name || row.full_name || row.registrant_name,
        row.email || row.user_email || row.registrant_email,
        row.phone || row.user_phone,
        row.role,
        paymentStatus(row),
        registrationStatus(row),
        row.registered_at || row.created_at,
        row.amount_paid || row.payment_amount || row.amount || '',
        row.transaction_id || row.payment_id || row.razorpay_payment_id || row.razorpay_order_id || ''
      ].map(csvCell).join(',');
    });
    var csv = '\ufeff' + [headers.map(csvCell).join(',')].concat(csvRows).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var anchor = document.createElement('a');
    var selectedWebinar = (webinars || []).find(function (row) { return webinarId(row) === selectedId; });
    var safeTitle = lower(webinarTitle(selectedWebinar)).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'webinar';
    anchor.href = URL.createObjectURL(blob);
    anchor.download = selectedId === 'all' ? 'guidcy_all_webinar_registrations.csv' : 'guidcy_webinar_registrations_' + safeTitle + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(function () {
      URL.revokeObjectURL(anchor.href);
      anchor.remove();
    }, 500);
  }

  window.wbnRenderRegs = loadPublicRegistrations;
  window.guidcyWbnSetRegFilter = function (value) {
    publicRegistrationState.selected = clean(value) || 'all';
    renderPublicRegistrations();
  };
  window.guidcyWbnSetRegSearch = function (value) {
    publicRegistrationState.search = clean(value);
    renderPublicRegistrations();
  };
  window.guidcyWbnResetRegFilter = function () {
    publicRegistrationState.selected = 'all';
    publicRegistrationState.search = '';
    renderPublicRegistrations();
  };
  window.wbnExportRegs = function () {
    var rows = publicFilteredRegistrations();
    publicRegistrationState.filtered = rows;
    exportRegistrationRows(rows, publicRegistrationState.selected, publicRegistrationState.webinars);
  };

  function dashboardFilteredRows() {
    var webinars = window.__guidcyWebinarsForRegs || [];
    var registrations = window.__guidcyWebinarRegs || [];
    var webinarMap = new Map(webinars.map(function (row) { return [webinarId(row), row]; }));
    var selected = clean(byId('wbn-admin-reg-webinar') && byId('wbn-admin-reg-webinar').value) || 'all';
    var selectedPayment = clean(byId('wbn-admin-reg-payment') && byId('wbn-admin-reg-payment').value) || 'all';
    var selectedStatus = clean(byId('wbn-admin-reg-status') && byId('wbn-admin-reg-status').value) || 'all';
    var search = lower(byId('wbn-admin-reg-search') && byId('wbn-admin-reg-search').value);
    var showDeleted = !!(byId('wbn-admin-show-deleted') && byId('wbn-admin-show-deleted').checked);
    return registrations.map(function (row) {
      var linkedWebinar = webinarMap.get(registrationWebinarId(row));
      return Object.assign({}, row, {
        _webinar: linkedWebinar,
        _webinarTitle: clean(row.webinar_title || row.webinarTitle) || webinarTitle(linkedWebinar),
        _payment_status: paymentStatus(row),
        _registration_status: registrationStatus(row)
      });
    }).filter(function (row) {
      if (!showDeleted && row._registration_status === 'deleted') return false;
      if (selected !== 'all' && registrationWebinarId(row) !== selected) return false;
      if (selectedPayment !== 'all' && row._payment_status !== selectedPayment) return false;
      if (selectedStatus !== 'all' && row._registration_status !== selectedStatus) return false;
      if (!search) return true;
      return lower([row._webinarTitle, row.name, row.email, row.phone, row.role, row._payment_status, row._registration_status].join(' ')).indexOf(search) >= 0;
    });
  }

  window.guidcyFilterWebinarRegs = function () {
    var rows = dashboardFilteredRows();
    window.__guidcyFilteredWebinarRegs = rows;
    var selected = clean(byId('wbn-admin-reg-webinar') && byId('wbn-admin-reg-webinar').value) || 'all';
    var webinars = window.__guidcyWebinarsForRegs || [];
    var selectedWebinar = webinars.find(function (row) { return webinarId(row) === selected; });
    var count = byId('wbn-admin-reg-count');
    var exportButton = byId('wbn-admin-reg-export');
    if (count) count.textContent = (selected === 'all' ? 'All webinars' : webinarTitle(selectedWebinar)) + ' · ' + rows.length + ' registration' + (rows.length === 1 ? '' : 's');
    if (exportButton) exportButton.textContent = selected === 'all' ? 'Export all registrations' : 'Export selected webinar';
    var table = byId('wbn-admin-reg-table');
    if (!table) return rows;
    if (!rows.length) {
      table.innerHTML = '<div class="wbn-reg-empty">No registrations found for the selected webinar/filter.</div>';
      return rows;
    }
    table.innerHTML = '<div class="wbn-reg-table-wrap"><table class="wbn-reg-table"><thead><tr><th>Webinar</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Registration</th><th>Payment</th><th>Amount</th><th>Txn ID</th><th>Registered at</th><th>Action</th></tr></thead><tbody>' + rows.map(function (row) {
      var id = clean(row.id);
      var amount = row.amount_paid || row.payment_amount || row.amount || '';
      var transaction = clean(row.transaction_id || row.payment_id || row.razorpay_payment_id || row.razorpay_order_id) || '—';
      var registeredAt = row.registered_at || row.created_at;
      return '<tr data-webinar-id="' + escapeHtml(registrationWebinarId(row)) + '"><td><strong>' + escapeHtml(row._webinarTitle) + '</strong></td><td>' + escapeHtml(row.name || row.full_name || row.registrant_name || '—') + '</td><td>' + escapeHtml(row.email || row.user_email || row.registrant_email || '—') + '</td><td>' + escapeHtml(row.phone || row.user_phone || '—') + '</td><td>' + escapeHtml(row.role || '—') + '</td><td><span class="wbn-reg-status ' + escapeHtml(row._registration_status) + '">' + escapeHtml(row._registration_status.replace(/_/g, ' ')) + '</span></td><td><span class="wbn-reg-status ' + escapeHtml(row._payment_status) + '">' + escapeHtml(row._payment_status) + '</span></td><td>' + escapeHtml(money(amount)) + '</td><td>' + escapeHtml(transaction) + '</td><td>' + escapeHtml(registeredAt ? new Date(registeredAt).toLocaleString('en-IN') : '—') + '</td><td>' + (row._registration_status === 'deleted' ? 'Deleted' : '<button class="wbn-reg-delete-btn" type="button" onclick="guidcyConfirmDeleteWebinarReg(\'' + escapeHtml(id) + '\')">Delete</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    return rows;
  };

  window.guidcyExportFilteredWebinarRegs = function () {
    var rows = dashboardFilteredRows().filter(function (row) { return row._registration_status !== 'deleted'; });
    window.__guidcyFilteredWebinarRegs = rows;
    var selected = clean(byId('wbn-admin-reg-webinar') && byId('wbn-admin-reg-webinar').value) || 'all';
    exportRegistrationRows(rows, selected, window.__guidcyWebinarsForRegs || []);
  };

  var originalPublish = window.wbnPublish;
  if (typeof originalPublish === 'function') {
    window.wbnPublish = function () {
      var date = clean(byId('wbn-pub-date') && byId('wbn-pub-date').value);
      var time = clean(byId('wbn-pub-time') && byId('wbn-pub-time').value);
      if (date && time) {
        var startsAt = new Date(date + 'T' + time);
        if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() <= Date.now()) {
          toast('Choose a future webinar date and time. Past webinars are not shown in the Upcoming webinars list.', 'red');
          return Promise.resolve(false);
        }
      }
      return originalPublish.apply(this, arguments);
    };
  }

  function setMinimumWebinarDate() {
    var dateInput = byId('wbn-pub-date');
    if (!dateInput) return;
    var now = new Date();
    dateInput.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  document.addEventListener('DOMContentLoaded', function () {
    setMinimumWebinarDate();
    var state = paymentState();
    if (state && /^\/payment\/?$/.test(location.pathname || '')) {
      setTimeout(function () {
        window.__guidcyPaymentFlowLock = !!state.blocking;
        ensurePaymentPage();
        setPaymentStatus(state.completed ? 'success' : 'ready', state.completed ? 'Payment successful' : 'Ready for secure payment', state.completed ? 'Choose an action from the confirmation popup.' : 'Review the webinar details, then click Pay & register.');
        if (state.completed) showWebinarConfirmation(state.registration, state.webinar);
      }, 350);
    }
  });
  window.addEventListener('load', function () {
    setMinimumWebinarDate();
    if (isAdmin() && byId('wbn-registrations-panel')) setTimeout(loadPublicRegistrations, 250);
  });

})();
