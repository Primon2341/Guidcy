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
      user_id: accountId() || null,
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
    /* the shared setter drives the step bar; this fallback path must too, or a
       confirmed payment leaves the bar sitting on step 2 "Payment" */
    try { window.guidcySetPaymentStep && window.guidcySetPaymentStep(kind === 'success'); } catch (_) {}
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
        return '<div class="pay-sum-row"><span style="color:var(--muted)">' + escapeHtml(row[0]) + '</span><span style="font-weight:600;text-align:right">' + escapeHtml(row[1]) + '</span></div>';
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
        : 'You’re registered! 🎉 Your webinar registration is confirmed and saved under My Webinars in your dashboard.') + '</div>' +
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rs);padding:14px;text-align:left;margin-bottom:18px">' +
      '<div class="pay-sum-row"><span style="color:var(--muted)">Webinar</span><span style="font-weight:600;text-align:right">' + escapeHtml(webinarTitle(webinar)) + '</span></div>' +
      '<div class="pay-sum-row"><span style="color:var(--muted)">Date</span><span>' + escapeHtml(formatDate(webinar.date || webinar.webinar_date)) + '</span></div>' +
      '<div class="pay-sum-row"><span style="color:var(--muted)">Time</span><span>' + escapeHtml(formatTime(webinar.time || webinar.webinar_time)) + '</span></div>' +
      '<div class="pay-sum-row"><span style="color:var(--muted)">Registration ID</span><span style="word-break:break-all;text-align:right">' + escapeHtml(registration.id) + '</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button class="btn btn-blue" type="button" onclick="guidcyWebinarPaymentOutcomeAction(\'my-webinars\')">View in My Webinars</button>' +
      '<button class="btn" type="button" onclick="guidcyWebinarPaymentOutcomeAction(\'webinars\')">View webinars</button>' +
      '<button class="btn" type="button" onclick="guidcyWebinarPaymentOutcomeAction(\'stay\')">Stay on Payment page</button>' +
      '</div></div>';
    document.body.appendChild(popup);
  }

  window.guidcyWebinarPaymentOutcomeAction = function (action) {
    var popup = byId('booking-confirm-popup');
    if (popup) popup.remove();
    if (action === 'my-webinars') {
      var state = paymentState();
      clearPaymentState();
      window.__guidcyPaymentFlowLock = false;
      openMyWebinarsTab(state && state.webinar && state.webinar.id);
      return;
    }
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
      invalidateMyWebinars();
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

  /* Tried to register with details that are already registered. Show it as a
     dismissible notice inside the form and leave every field exactly as typed -
     replacing the form with a success panel meant the visitor could not correct
     the email and try again without reopening the whole modal. */
  function showAlreadyRegisteredNotice(webinar, email) {
    var form = byId('wbn-reg-form');
    if (!form) return;
    form.style.display = '';
    var success = byId('wbn-reg-success');
    if (success) success.classList.remove('on');
    clearAlreadyRegisteredNotice();
    var box = document.createElement('div');
    box.id = 'wbn-reg-already';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:relative;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 40px 14px 14px;margin-bottom:14px;color:#92400E;font-size:13px;line-height:1.6';
    box.innerHTML =
      '<button type="button" id="wbn-reg-already-close" aria-label="Dismiss" style="position:absolute;top:7px;right:9px;border:none;background:transparent;font-size:19px;line-height:1;color:#92400E;cursor:pointer">&times;</button>' +
      '<b>You are already registered</b><br>' + escapeHtml(email) +
      ' is already registered for "' + escapeHtml(webinarTitle(webinar)) +
      '" and it is already paid for, so no new payment was taken. Close this to edit the details, or use a different email to register someone else.';
    form.insertBefore(box, form.firstChild);
    var close = byId('wbn-reg-already-close');
    if (close) close.onclick = function () { clearAlreadyRegisteredNotice(); focusRegistrationEmail(); };
    focusRegistrationEmail();
    try { box.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  }
  function clearAlreadyRegisteredNotice() {
    var old = byId('wbn-reg-already');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }
  function focusRegistrationEmail() {
    var input = byId('wbn-reg-email');
    if (!input) return;
    try { input.focus(); input.select(); } catch (_) {}
  }

  async function submitWebinarRegistration() {
    if (window.__guidcyWebinarRegistrationBusy) return;
    clearAlreadyRegisteredNotice();
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
      // a free row is inserted already confirmed, so only a pre-existing seat counts here
      if (!paid && registration.__alreadyConfirmed) {
        showAlreadyRegisteredBox(webinar, registration.email || details.email);
        return;
      }
      if (paid) {
        /* Already paid for with this email. Sending them to the payment page and
           then popping "Payment successful" read as a charge that never happened -
           Razorpay is not opened here, and nothing is taken. Say so where they
           already are, in the registration form, and leave the payment flow out
           of it entirely. */
        if (registration.__alreadyConfirmed || isConfirmedRegistration(registration)) {
          clearPaymentState();
          window.__guidcyPaymentFlowLock = false;
          showAlreadyRegisteredNotice(webinar, registration.email || details.email);
          toast('That email is already registered for this webinar.', 'blue');
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
      invalidateMyWebinars();
      showSuccessBox('You’re registered! 🎉', 'You registered for "' + webinarTitle(webinar) + '". The meeting link will be sent before the session.', 'Close', webinar.id);
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

  /* ── Account gate ────────────────────────────────────────────────────
     Every webinar CTA (cards, dashboards, search, the agent) ends up in
     wbnOpenReg, so the "must have a Guidcy account" rule lives here and
     nowhere else. A signed-out visitor gets the sign-up prompt instead of the
     form; the webinar they wanted is remembered in sessionStorage (same tab
     as the login round-trip, 30-minute ceiling) and reopened after the
     existing login / signup / OAuth completion hooks fire. */
  var INTENT_KEY = 'guidcy_webinar_intent_v1';
  var INTENT_MAX_AGE_MS = 30 * 60 * 1000;
  var resumingWebinarIntent = false;

  function accountUser() {
    var user = window.currentUser;
    return user && user.id && !window.__guidcySignedOut ? user : null;
  }

  /* currentUser is filled asynchronously on boot, so an early click must ask
     Supabase before treating a signed-in visitor as signed-out. */
  async function signedInUser() {
    if (accountUser()) return accountUser();
    if (window.loggedIn && currentProfile().email) return { email: currentProfile().email, user_metadata: {} };
    try {
      var c = client();
      var result = c && c.auth && c.auth.getSession ? await c.auth.getSession() : null;
      var user = result && result.data && result.data.session && result.data.session.user;
      if (user && !window.__guidcySignedOut) {
        window.currentUser = user;
        try { currentUser = user; } catch (_) {}
        try { typeof window.loadProfile === 'function' && await window.loadProfile(); } catch (_) {}
        return user;
      }
    } catch (_) {}
    return null;
  }

  function saveIntent(id) {
    try { sessionStorage.setItem(INTENT_KEY, JSON.stringify({ webinarId: clean(id), at: Date.now() })); } catch (_) {}
  }
  function readIntent() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(INTENT_KEY) || 'null');
      if (saved && saved.webinarId && Date.now() - Number(saved.at || 0) < INTENT_MAX_AGE_MS) return clean(saved.webinarId);
    } catch (_) {}
    clearIntent();
    return '';
  }
  function clearIntent() {
    try { sessionStorage.removeItem(INTENT_KEY); } catch (_) {}
  }

  function showAccountGate(webinar) {
    var old = byId('guidcy-webinar-account-gate');
    if (old) old.remove();
    var popup = document.createElement('div');
    popup.id = 'guidcy-webinar-account-gate';
    popup.className = 'modal-overlay on';
    popup.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="guidcy-webinar-gate-title" style="max-width:460px;text-align:center">' +
      '<button class="modal-close" type="button" aria-label="Close" onclick="guidcyWebinarAccountAction(\'close\')">×</button>' +
      '<div style="width:64px;height:64px;border-radius:50%;background:var(--blue-l);border:2px solid var(--blue-m);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px">🎟️</div>' +
      '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--blue);margin-bottom:6px">Reserve your seat with Guidcy</div>' +
      '<div id="guidcy-webinar-gate-title" style="font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:600;color:var(--ink);line-height:1.2;margin-bottom:10px">Create your free Guidcy account to reserve your seat</div>' +
      (webinar ? '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:10px">' + escapeHtml(webinarTitle(webinar)) + '</div>' : '') +
      '<div style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:20px">Your Guidcy account lets you manage your webinar registrations, receive event updates and meeting details, and access your registered webinars from one place.</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<button class="btn btn-blue" type="button" style="width:100%;padding:12px" onclick="guidcyWebinarAccountAction(\'signup\')">Create Account</button>' +
      '<button class="btn" type="button" style="width:100%" onclick="guidcyWebinarAccountAction(\'signin\')">Already have an account? Sign In</button>' +
      '</div></div>';
    document.body.appendChild(popup);
    setTimeout(function () { try { popup.querySelector('.btn-blue').focus(); } catch (_) {} }, 50);
  }

  window.guidcyWebinarAccountAction = function (action) {
    var popup = byId('guidcy-webinar-account-gate');
    if (popup) popup.remove();
    if (action === 'close') { clearIntent(); return; }
    var page = action === 'signin' ? 'login' : 'signup';
    if (typeof window.go === 'function') window.go(page); else location.href = '/' + page;
    // webinar attendees are users; the signup page opens on the Consultant tab by default
    if (page === 'signup') setTimeout(function () { try { window.swType && window.swType('user'); } catch (_) {} }, 50);
  };

  function setValue(id, value) {
    var input = byId(id);
    if (input && !clean(input.value) && value) input.value = value;
  }
  /* Registration identity is the account email - that is what "already
     registered" and the DB uniqueness index are keyed on - so it cannot be
     edited. Everything else is a convenience prefill. */
  function prefillRegistrationForm(user) {
    var profile = currentProfile();
    var meta = user.user_metadata || {};
    setValue('wbn-reg-name', profile.full_name || meta.full_name || meta.name || '');
    setValue('wbn-reg-phone', profile.phone || meta.phone || '');
    var email = byId('wbn-reg-email');
    var accountEmail = lower(user.email || profile.email);
    if (email && accountEmail) {
      email.value = accountEmail;
      email.readOnly = true;
      email.style.background = 'var(--surface2)';
    }
    return accountEmail;
  }

  /* The success panel is shared markup; its texts are written before every
     use so an "already registered" message never survives into a fresh
     registration and vice versa. */
  function setSuccessBox(title, message, buttonLabel, myWebinarsId) {
    var box = byId('wbn-reg-success');
    if (!box) return;
    var heading = box.querySelector('.wbn-success-title');
    var text = byId('wbn-reg-success-msg');
    var button = box.querySelector('button');
    if (heading) heading.textContent = title;
    if (text) text.textContent = message;
    if (button) button.textContent = buttonLabel;
    // a fresh registration gets a direct way back to it: Dashboard → My Webinars
    var view = byId('gmw-success-view');
    if (view) view.remove();
    if (myWebinarsId && button) {
      view = document.createElement('button');
      view.id = 'gmw-success-view';
      view.className = 'btn btn-blue';
      view.type = 'button';
      view.style.cssText = 'margin:14px 8px 0 0';
      view.textContent = 'View in My Webinars';
      view.onclick = function () { openMyWebinarsTab(myWebinarsId); };
      button.parentNode.insertBefore(view, button);
    }
  }
  function showSuccessBox(title, message, buttonLabel, myWebinarsId) {
    setSuccessBox(title, message, buttonLabel, myWebinarsId);
    var form = byId('wbn-reg-form');
    var box = byId('wbn-reg-success');
    if (form) form.style.display = 'none';
    if (box) box.classList.add('on');
  }

  function showAlreadyRegisteredBox(webinar, email) {
    showSuccessBox('✓ You’re already registered',
      email + ' is registered for "' + webinarTitle(webinar) + '". Your meeting link is emailed before the session.',
      'View webinar details');
  }

  /* Signed-in user already holds a confirmed seat: show that instead of the
     form so a refresh / back / second click can never register them again. */
  async function showExistingRegistration(id, email) {
    var existing = null;
    try { existing = await findActiveRegistration(id, email); } catch (_) { return false; }
    if (!existing || !isConfirmedRegistration(existing) || clean(window.__guidcyCurrentWebinarId) !== clean(id)) return false;
    var webinar = null;
    try { webinar = await webinarById(id); } catch (_) {}
    showAlreadyRegisteredBox(webinar || { title: existing.webinar_title }, email);
    return true;
  }

  var originalOpenRegistration = window.wbnOpenReg;
  if (typeof originalOpenRegistration === 'function') {
    window.wbnOpenReg = function (id) {
      var self = this, args = arguments;
      window.__guidcyCurrentWebinarId = id;
      // a notice left over from a previous attempt must not greet the next one
      clearAlreadyRegisteredNotice();
      signedInUser().then(async function (user) {
        if (!user) {
          resumingWebinarIntent = false;
          saveIntent(id);
          var webinar = null;
          try { webinar = await webinarById(id); } catch (_) {}
          showAccountGate(webinar);
          return;
        }
        originalOpenRegistration.apply(self, args);
        var email = prefillRegistrationForm(user);
        var modal = byId('wbn-reg-modal');
        /* the original re-enters wbnOpenReg once the list has loaded, so the
           resume flag is only spent once the modal is actually on screen */
        if (!modal || !modal.classList.contains('on') || !email) return;
        var resume = resumingWebinarIntent;
        resumingWebinarIntent = false;
        setSuccessBox('You’re registered!', 'Check your email for the meeting link.', 'Close');
        if (await showExistingRegistration(id, email)) return;
        // came back from sign-up / sign-in: finish without a second click when the form is complete
        var details = registrationFormDetails();
        if (resume && details.name && details.email && details.phone) window.wbnSubmitReg();
      });
    };
  }

  /* After sign-up / sign-in, go straight back to the remembered webinar and
     reopen its registration - never the dashboard or home page. */
  async function resumeWebinarIntent() {
    var id = readIntent();
    if (!id || !(await signedInUser())) return false;
    clearIntent();
    if (typeof window.go === 'function') window.go('webinar'); else location.href = '/webinars';
    setTimeout(function () {
      resumingWebinarIntent = true;
      try { window.wbnOpenReg(id); } catch (_) { resumingWebinarIntent = false; }
      setTimeout(function () { resumingWebinarIntent = false; }, 10000);
    }, 700);
    return true;
  }
  window.guidcyResumeWebinarIntent = resumeWebinarIntent;

  // password + Google sign-in both finish through guidcyFinishLogin
  var originalFinishLogin = window.guidcyFinishLogin;
  window.guidcyFinishLogin = async function () {
    if (readIntent() && await resumeWebinarIntent()) return true;
    return typeof originalFinishLogin === 'function' ? originalFinishLogin.apply(this, arguments) : true;
  };
  // sign-up routes to the dashboard itself ~700ms after the account exists
  var originalSignup = window.doSignup;
  if (typeof originalSignup === 'function') {
    window.doSignup = async function () {
      var out = await originalSignup.apply(this, arguments);
      if (readIntent()) setTimeout(resumeWebinarIntent, 900);
      return out;
    };
    // the app re-wraps doSignup unless these markers are present
    Object.keys(originalSignup).forEach(function (key) { window.doSignup[key] = originalSignup[key]; });
  }
  // auth completed some other way (e.g. OAuth reload): still honour the intent once
  window.addEventListener('load', function () {
    var oauthPending = false;
    try { oauthPending = !!(window.guidcyOAuthLoginPending && window.guidcyOAuthLoginPending()); } catch (_) {}
    if (readIntent() && !oauthPending) setTimeout(resumeWebinarIntent, 1500);
  });
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

  /* Publishing generates the webinar's Google Meet through the same server
     integration a 1:1 booking uses. The endpoint is idempotent per webinar, so
     publishing twice or editing the webinar moves the existing event instead of
     creating a second meeting. Returns '' when Meet is not configured, which is
     not an error - the host can still paste a link. */
  async function sessionAccessToken() {
    try {
      var client = (window.guidcyGetSupabaseClient && window.guidcyGetSupabaseClient()) || window.sb;
      var session = client && client.auth && await client.auth.getSession();
      return (session && session.data && session.data.session && session.data.session.access_token) || '';
    } catch (_) {
      return '';
    }
  }

  window.guidcyEnsureWebinarMeeting = async function (webinarId) {
    var id = clean(webinarId);
    if (!id) return '';
    var token = await sessionAccessToken();
    if (!token) return '';
    try {
      var response = await fetch('/api/create-meet-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ webinarId: id }),
      });
      var body = await response.json().catch(function () { return {}; });
      if (!body || !body.link) console.warn('Webinar meeting not created:', response.status, body);
      return (body && body.link) || '';
    } catch (error) {
      console.warn('Webinar meeting link could not be generated:', error && error.message);
      return '';
    }
  };

  /* The generated link is shown in the Meeting link field itself, with a note
     underneath. What it must never do is get SAVED from there: that input is
     written to webinars.meet_link, and public.webinars has a SELECT policy of
     `true`, so a join URL stored in it is readable by every visitor. The publish
     wrapper therefore takes our value back out of the field before the save
     runs, and puts it back afterwards. */
  var shownGeneratedLink = '';

  /* Publishing must not take the panel away before the link is in the field:
     wbnRender() calls wbnApplyAdminState(), which sets #wbn-admin-panel to
     display:none whenever isAdmin() is false - true for a consultant publishing
     their own webinar - so the link was being written into a hidden field.
     Only ever reopens a panel that was already open when the host clicked, so it
     cannot show the panel to anyone who could not already see it. */
  function panelIsOpen() {
    var panel = byId('wbn-admin-panel');
    return !!panel && panel.style.display !== 'none';
  }

  var hostClosedPanel = false;

  function keepPanelOpen(wasOpen) {
    if (!wasOpen || hostClosedPanel) return;
    var panel = byId('wbn-admin-panel');
    if (panel && panel.style.display === 'none') panel.style.display = 'block';
  }

  /* The panel is held open until the meeting link is in the field, so the host
     needs a way to put it away themselves. An explicit close is final: nothing
     here reopens it until they open it again. */
  window.guidcyCloseWebinarPanel = function () {
    hostClosedPanel = true;
    showGeneratedMeetingLink('');
    var panel = byId('wbn-admin-panel');
    if (panel) panel.style.display = 'none';
  };

  function generatedLinkNote() {
    var input = byId('wbn-pub-link');
    if (!input || !input.parentNode) return null;
    var note = byId('wbn-pub-link-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'wbn-pub-link-note';
      note.style.cssText = 'display:none;margin-top:6px;font-size:12px;line-height:1.5;color:var(--muted,#6B7280)';
      input.parentNode.appendChild(note);
    }
    return note;
  }

  /* Only ever touches the field's own generated value, so a link the host typed
     is left exactly where they put it - and still saves the way it always did. */
  function hostTypedTheirOwnLink(input) {
    var current = clean(input && input.value);
    return !!current && current !== shownGeneratedLink;
  }

  function showGeneratedMeetingLink(link) {
    var input = byId('wbn-pub-link');
    var note = generatedLinkNote();
    var url = clean(link);
    if (!url) {
      if (input && !hostTypedTheirOwnLink(input)) input.value = '';
      shownGeneratedLink = '';
      if (note) { note.textContent = ''; note.style.display = 'none'; }
      return;
    }
    if (input && hostTypedTheirOwnLink(input)) return;
    shownGeneratedLink = url;
    if (input) input.value = url;
    if (note) {
      note.textContent = 'Generated automatically. Visible only to you and confirmed registrants — everyone who registers is emailed this link.';
      note.style.display = 'block';
    }
  }

  async function storedMeetingLink(webinarId) {
    var id = clean(webinarId);
    if (!id) return '';
    try {
      var c = client();
      if (!c || !c.from) return '';
      var result = await c.from('webinar_meetings').select('meet_link').eq('webinar_id', id).maybeSingle();
      return (result && result.data && result.data.meet_link) || '';
    } catch (_) {
      return '';
    }
  }

  /* window.wbnPublish is reassigned by a dozen modules in app.js, several of
     which replace it outright rather than wrap it, and the edit paths never
     reach the one that creates a webinar. This wrapper is installed last and is
     therefore the only place every publish and every edit passes through, so
     the meeting is booked from here. The new-publish path hands over the id it
     generated; an edit already has it in the edit-mode globals. */
  function editingWebinarId() {
    return clean(window.__guidcyEditingWebinarRowId || window.__guidcyEditingWebinarId
      || window.editingWebinarId || (byId('wbn-edit-id') && byId('wbn-edit-id').value));
  }

  var originalPublish = window.wbnPublish;
  if (typeof originalPublish === 'function') {
    window.wbnPublish = async function () {
      var date = clean(byId('wbn-pub-date') && byId('wbn-pub-date').value);
      var time = clean(byId('wbn-pub-time') && byId('wbn-pub-time').value);
      if (date && time) {
        var startsAt = new Date(date + 'T' + time);
        if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() <= Date.now()) {
          toast('Choose a future webinar date and time. Past webinars are not shown in the Upcoming webinars list.', 'red');
          return false;
        }
      }
      /* Read before publishing: a successful publish clears edit mode. */
      var editId = editingWebinarId();
      var panelWasOpen = panelIsOpen();
      hostClosedPanel = false;
      window.__guidcyLastPublishedWebinarId = '';
      /* Take the generated link back out of the field before the save reads it,
         or it lands in webinars.meet_link, which every visitor can read. It goes
         back in below once the meeting is confirmed. A link the host typed is
         left alone and saves exactly as it used to. */
      showGeneratedMeetingLink('');
      var result = await originalPublish.apply(this, arguments);
      if (result === false) return result;
      keepPanelOpen(panelWasOpen);
      var webinarId = clean(window.__guidcyLastPublishedWebinarId) || editId;
      if (webinarId && typeof window.guidcyEnsureWebinarMeeting === 'function') {
        /* Never blocks or fails the publish: the host can still paste a link. */
        try {
          var link = await window.guidcyEnsureWebinarMeeting(webinarId);
          if (link) {
            showGeneratedMeetingLink(link);
            /* The panel stays until the link is in the field, not a moment
               before - including the render that lands while we were waiting. */
            keepPanelOpen(panelWasOpen);
            setTimeout(function () { keepPanelOpen(panelWasOpen); }, 600);
            toast('Meeting link created — everyone who registers is invited to it.', 'green');
          }
        } catch (error) {
          console.warn('Webinar meeting link could not be generated:', error && error.message);
        }
      }
      return result;
    };
  }

  /* Opening a webinar for editing shows the link it already has, so the host can
     find it again without republishing.
     Wrapped here rather than on wbnEditSession: that function calls this one
     WITHOUT awaiting it and returns straight away, so hooking it left our fetch
     racing the form fill - and the fill ends with setVal('wbn-pub-link', w.link),
     which is empty for a generated meeting. Whichever request answered first won,
     so the link appeared only every few attempts. This one returns a promise, so
     the link is written after the fields are populated, every time. */
  var originalOpenEditForm = window.guidcyOpenWebinarEditForm;
  if (typeof originalOpenEditForm === 'function') {
    window.guidcyOpenWebinarEditForm = window.openWebinarEditForm = async function (webinarId) {
      hostClosedPanel = false;
      showGeneratedMeetingLink('');
      var opened = await originalOpenEditForm.apply(this, arguments);
      if (opened === false) return opened;
      showGeneratedMeetingLink(await storedMeetingLink(editingWebinarId() || webinarId));
      return opened;
    };
  }

  /* Deleting a webinar has to take its meeting off the calendar too, or everyone
     who registered keeps an invite to a session that is not happening. Asked
     before the rows go: the webinar row is what proves ownership to the server,
     and webinar_meetings is removed with it by the foreign key. */
  async function requestMeetingDeletion(webinarId) {
    var token = await sessionAccessToken();
    if (!token) return null;
    var response = await fetch('/api/create-meet-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ webinarId: webinarId, action: 'delete_webinar_meeting' }),
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || (body && body.ok === false)) {
      throw new Error((body && body.error) || ('HTTP ' + response.status));
    }
    return body;
  }

  var originalDeleteSession = window.wbnDeleteSession;
  if (typeof originalDeleteSession === 'function') {
    window.wbnDeleteSession = async function (webinarId) {
      var id = clean(webinarId);
      if (!id) return originalDeleteSession.apply(this, arguments);
      if (!window.confirm('Delete this webinar? Its meeting is removed from the calendar and everyone who registered is told it is cancelled. This cannot be undone.')) return;

      var calendarCleared = true;
      try {
        await requestMeetingDeletion(id);
      } catch (error) {
        calendarCleared = false;
        console.warn('Webinar meeting could not be removed from the calendar:', error && error.message);
      }

      /* The chain below asks the same question again. It reads confirm()
         synchronously before its first await, so the override is put back
         before any other code can observe it. */
      var nativeConfirm = window.confirm;
      var pending;
      window.confirm = function () { return true; };
      try {
        pending = originalDeleteSession.apply(this, arguments);
      } finally {
        window.confirm = nativeConfirm;
      }
      var result = await pending;
      if (!calendarCleared) toast('Webinar deleted, but its calendar meeting could not be removed. Please delete it in Google Calendar.', 'red');
      return result;
    };
  }

  var originalCancelEdit = window.wbnCancelEdit;
  window.wbnCancelEdit = function () {
    showGeneratedMeetingLink('');
    return typeof originalCancelEdit === 'function' ? originalCancelEdit.apply(this, arguments) : undefined;
  };

  function setMinimumWebinarDate() {
    var dateInput = byId('wbn-pub-date');
    if (!dateInput) return;
    var now = new Date();
    dateInput.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /* ── My Webinars ─────────────────────────────────────────────────────
     The attendee view: every webinar this account registered for, in both
     the user and consultant dashboards. Consultants' own published webinars
     stay in "Webinar history"; this list is only what they registered to
     attend. Registrations are matched by account id first, email second
     (rows older than the user_id column). Supabase is the only source:
     nothing is cached beyond one minute in memory. */
  var MY_WEBINARS_CACHE_MS = 60 * 1000;
  var JOIN_WINDOW_MS = 60 * 60 * 1000;
  var myWebinars = { items: [], loadedAt: 0, loadedFor: '', filter: 'upcoming', pendingDetail: '', panel: '' };

  function accountId() { return clean(window.currentUser && window.currentUser.id); }
  function accountEmail() { return lower((window.currentUser && window.currentUser.email) || currentProfile().email); }
  function invalidateMyWebinars() { myWebinars.loadedAt = 0; }

  async function rowsIn(table, column, values, select) {
    var db = client();
    values = (values || []).filter(Boolean);
    if (!db || !db.from || !values.length) return [];
    try {
      var response = await db.from(table).select(select || '*').in(column, values);
      return (response && response.data) || [];
    } catch (_) { return []; }
  }

  async function loadMyWebinars(force) {
    var key = accountId() + '|' + accountEmail();
    if (!force && myWebinars.loadedFor === key && Date.now() - myWebinars.loadedAt < MY_WEBINARS_CACHE_MS) return myWebinars.items;
    // the router replays dashboard renders; one fetch serves all of them
    if (myWebinars.inflight && myWebinars.inflightFor === key) return myWebinars.inflight;
    myWebinars.inflightFor = key;
    myWebinars.inflight = fetchMyWebinars(key).finally(function () { myWebinars.inflight = null; });
    return myWebinars.inflight;
  }
  async function fetchMyWebinars(key) {
    var db = client();
    if (!db || !db.from || (!accountId() && !accountEmail())) return [];
    var registrations = [];
    if (accountId()) registrations = registrations.concat((await db.from('webinar_registrations').select('*').eq('user_id', accountId())).data || []);
    if (accountEmail()) registrations = registrations.concat((await db.from('webinar_registrations').select('*').ilike('email', accountEmail())).data || []);
    /* one card per webinar: the confirmed row wins, then the newest */
    var byWebinar = {};
    dedupeRegistrations(registrations).forEach(function (row) {
      if (!isConfirmedRegistration(row) && paymentStatus(row) !== 'refunded') return;
      var id = registrationWebinarId(row);
      if (!id) return;
      var current = byWebinar[id];
      if (!current || (isConfirmedRegistration(row) && !isConfirmedRegistration(current)) ||
          new Date(row.registered_at || 0) > new Date(current.registered_at || 0)) byWebinar[id] = row;
    });
    var ids = Object.keys(byWebinar);
    var webinars = await rowsIn('webinars', 'id', ids);
    var meetings = await rowsIn('webinar_meetings', 'webinar_id', ids, 'webinar_id,meet_link');
    var hostIds = webinars.map(function (w) { return clean(w.created_by); });
    var hostEmails = webinars.map(function (w) { return lower(w.publisher_email); });
    var profiles = (await rowsIn('profiles', 'id', hostIds, 'id,email,avatar_url,full_name'))
      .concat(await rowsIn('profiles', 'email', hostEmails, 'id,email,avatar_url,full_name'));
    var consultants = await rowsIn('consultants', 'profile_id', profiles.map(function (p) { return p.id; }), 'id,profile_id');
    var items = ids.map(function (id) {
      var registration = byWebinar[id];
      var webinar = webinars.find(function (w) { return clean(w.id) === id; }) || null;
      var meeting = meetings.find(function (m) { return clean(m.webinar_id) === id; });
      var host = webinar && profiles.find(function (p) {
        return (clean(webinar.created_by) && p.id === webinar.created_by) || (lower(webinar.publisher_email) && lower(p.email) === lower(webinar.publisher_email));
      });
      var consultant = host && consultants.find(function (c) { return c.profile_id === host.id; });
      var link = clean((meeting && meeting.meet_link) || (webinar && webinar.meet_link));
      var amount = Number(registration.amount_paid || registration.payment_amount || 0);
      var status;
      if (!webinar || paymentStatus(registration) === 'refunded') status = 'cancelled';
      else if (webinarHasEnded(webinar)) status = 'completed';
      else status = 'upcoming';
      return {
        id: id,
        registration: registration,
        webinar: webinar || { id: id, title: registration.webinar_title || 'Webinar' },
        startsAt: webinar ? webinarStartsAt(webinar) : null,
        status: status,
        link: link,
        paid: amount > 0,
        amount: amount,
        avatar: host && host.avatar_url,
        consultantId: consultant && consultant.id
      };
    });
    myWebinars.items = items;
    myWebinars.loadedAt = Date.now();
    myWebinars.loadedFor = key;
    return items;
  }

  function isLiveNow(item) {
    if (item.status !== 'upcoming' || !item.startsAt) return false;
    var start = item.startsAt.getTime();
    return Date.now() >= start - JOIN_WINDOW_MS;
  }
  function sortedMyWebinars(filter) {
    var rank = { upcoming: 0, completed: 1, cancelled: 2 };
    return myWebinars.items.filter(function (item) { return filter === 'all' || item.status === filter; }).sort(function (a, b) {
      if (a.status !== b.status) return rank[a.status] - rank[b.status];
      var at = a.startsAt ? a.startsAt.getTime() : 0, bt = b.startsAt ? b.startsAt.getTime() : 0;
      return a.status === 'upcoming' ? at - bt : bt - at;   // nearest first; most recently completed first
    });
  }
  function myWebinarCounts() {
    var counts = { registered: myWebinars.items.length, upcoming: 0, completed: 0, cancelled: 0 };
    myWebinars.items.forEach(function (item) { counts[item.status]++; });
    return counts;
  }

  function statusPill(item) {
    if (item.status === 'cancelled') return '<span class="status-pill sp-cancelled">🔴 Cancelled</span>';
    if (item.status === 'completed') return '<span class="status-pill sp-done">✓ Completed</span>';
    return '<span class="status-pill sp-upcoming">' + (isLiveNow(item) ? '🟢 Live soon' : '🟢 Upcoming') + '</span>';
  }
  function priceLabel(item) {
    return item.paid ? money(item.amount) + ' • Paid' : 'Free';
  }
  function refundLabel(item) {
    if (item.status !== 'cancelled' || !item.paid) return '';
    return paymentStatus(item.registration) === 'refunded' ? ' · Refunded' : ' · Refund Pending';
  }
  function modeLabel(item) {
    return /meet\.google\.com/i.test(item.link) ? 'Google Meet / Online' : 'Online';
  }
  function speakerAvatar(item, size) {
    var name = clean(item.webinar.speaker || item.webinar.publisher_name || 'Host');
    var initials = name.split(/\s+/).map(function (part) { return part[0] || ''; }).join('').slice(0, 2).toUpperCase() || 'H';
    var style = 'width:' + size + 'px;height:' + size + 'px;background:var(--blue-l);color:var(--blue-d);border-color:var(--blue-m)';
    return '<span class="wbn-speaker-av" style="' + style + '">' + (item.avatar
      ? '<img src="' + escapeHtml(item.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">'
      : escapeHtml(initials)) + '</span>';
  }
  function thumbClass(item) {
    var text = clean(item.webinar.category || item.webinar.title);
    var sum = 0;
    for (var i = 0; i < text.length; i++) sum += text.charCodeAt(i);
    return ['', 't1', 't2'][sum % 3];
  }
  function joinButton(item, extraClass) {
    if (item.status !== 'upcoming' || !item.link) return '';
    var hot = isLiveNow(item);
    return '<a class="btn ' + (hot ? 'gmw-join-hot' : 'btn-blue') + ' ' + (extraClass || '') + '" href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener">' + (hot ? 'Join now' : 'Join Webinar') + '</a>';
  }
  function whenLabel(item) {
    var w = item.webinar;
    return formatDate(w.date) + (w.time ? ' • ' + formatTime(w.time).replace(' IST', '') : '');
  }

  function myWebinarCard(item) {
    var w = item.webinar;
    return '<article class="gmw-card" data-gmw-id="' + escapeHtml(item.id) + '">' +
      '<div class="gmw-thumb ' + thumbClass(item) + '"><span class="gmw-cat">' + escapeHtml(w.category || 'Webinar') + '</span>' + statusPill(item) + '</div>' +
      '<div class="gmw-body">' +
      '<div class="gmw-title">' + escapeHtml(webinarTitle(w)) + '</div>' +
      '<div class="gmw-speaker">' + speakerAvatar(item, 32) + '<span>' + escapeHtml(w.speaker || w.publisher_name || 'Guidcy host') + (w.speaker_role ? '<small>' + escapeHtml(w.speaker_role) + '</small>' : '') + '</span></div>' +
      (item.status === 'cancelled'
        ? '<div class="gmw-cancel-note">Webinar Cancelled' + escapeHtml(refundLabel(item)) + '</div>'
        : '<div class="gmw-meta"><span>📅 ' + escapeHtml(formatDate(w.date)) + '</span><span>🕐 ' + escapeHtml(formatTime(w.time)) + '</span><span>⏱ ' + escapeHtml(w.duration || '—') + '</span><span>💻 ' + escapeHtml(modeLabel(item)) + '</span></div>') +
      '<div class="gmw-foot"><span class="gmw-price">' + escapeHtml(priceLabel(item)) + '</span>' +
      '<div class="gmw-actions"><button class="btn" type="button" onclick="guidcyMyWebinarsAction(\'details\',\'' + escapeHtml(item.id) + '\')">View Details</button>' + joinButton(item) + '</div></div>' +
      '</div></article>';
  }

  function myWebinarsHtml() {
    var counts = myWebinarCounts();
    var tabs = ['all', 'upcoming', 'completed', 'cancelled'];
    var list = sortedMyWebinars(myWebinars.filter);
    var empty = {
      all: 'You have not registered for any webinar yet.',
      upcoming: 'No upcoming webinars. Explore upcoming sessions and learn directly from experts.',
      completed: 'No completed webinars yet.',
      cancelled: 'No cancelled webinars.'
    }[myWebinars.filter];
    return '<div class="dash-title">My Webinars</div>' +
      '<div class="gmw-summary">' +
      '<span><b>' + counts.registered + '</b> Registered</span><span><b>' + counts.upcoming + '</b> Upcoming</span><span><b>' + counts.completed + '</b> Completed</span>' +
      (counts.cancelled ? '<span><b>' + counts.cancelled + '</b> Cancelled</span>' : '') +
      '</div>' +
      '<div class="gmw-tabs" role="tablist">' + tabs.map(function (tab) {
        return '<button class="gmw-tab' + (tab === myWebinars.filter ? ' on' : '') + '" type="button" role="tab" aria-selected="' + (tab === myWebinars.filter) + '" onclick="guidcyMyWebinarsAction(\'filter\',\'' + tab + '\')">' + tab.charAt(0).toUpperCase() + tab.slice(1) + '</button>';
      }).join('') + '</div>' +
      (list.length
        ? '<div class="gmw-grid">' + list.map(myWebinarCard).join('') + '</div>'
        : '<div class="guidcy-wbn-empty"><div style="font-size:38px;margin-bottom:10px">🎓</div><div style="font-size:16px;font-weight:700;color:var(--ink);margin-bottom:6px">' + escapeHtml(empty) + '</div><button class="btn btn-blue" type="button" style="margin-top:12px" onclick="guidcyMyWebinarsAction(\'explore\')">Explore Webinars</button></div>');
  }

  function myWebinarsPanel() {
    return byId(myWebinars.panel === 'swCD' ? 'cdash-main' : 'udash-main');
  }
  /* Is My Webinars the tab the user currently has selected in this panel? */
  function myWebinarsSelected(panel) {
    var page = panel.closest('.page');
    var button = page && page.querySelector('.side-btn.on,.side-btn.active');
    var urlTab = '';
    try { urlTab = new URLSearchParams(location.search).get('tab') || ''; } catch (_) {}
    return !!(page && page.classList.contains('on') && button && button.dataset.dashSection === 'my-webinars' && (!urlTab || urlTab === 'my-webinars'));
  }
  function paintMyWebinars() {
    var panel = myWebinarsPanel();
    if (!panel) return;
    panel.innerHTML = myWebinarsHtml();
    if (myWebinars.pendingDetail) {
      var id = myWebinars.pendingDetail;
      myWebinars.pendingDetail = '';
      openMyWebinarDetail(id);
    }
  }

  window.guidcyRenderMyWebinars = async function (name, button) {
    myWebinars.panel = name === 'swCD' ? 'swCD' : 'swUD';
    var panel = myWebinarsPanel();
    if (!panel) return;
    if (button) { try { window.closeDashMenu && window.closeDashMenu(name === 'swCD' ? 'cons' : 'user'); } catch (_) {} }
    if (!panel.querySelector('.gmw-grid')) panel.innerHTML = '<div class="dash-title">My Webinars</div><div class="guidcy-dash-loading">Loading your webinars…</div>';
    try {
      await loadMyWebinars(!!button);
    } catch (error) {
      console.warn('My Webinars failed to load:', error);
      panel.innerHTML = '<div class="dash-title">My Webinars</div><div class="guidcy-wbn-empty">Could not load your webinars. <button class="btn" type="button" onclick="guidcyMyWebinarsAction(\'reload\')">Try again</button></div>';
      return;
    }
    paintMyWebinars();
  };

  function findMyWebinar(id) {
    return myWebinars.items.find(function (item) { return item.id === clean(id); });
  }
  function closeMyWebinarDetail() {
    var old = byId('gmw-detail');
    if (old) old.remove();
  }
  function openMyWebinarDetail(id) {
    var item = findMyWebinar(id);
    if (!item) return;
    closeMyWebinarDetail();
    var w = item.webinar, r = item.registration;
    var field = function (label, value) { return value ? '<div><small>' + label + '</small>' + escapeHtml(value) + '</div>' : ''; };
    var access;
    if (item.status === 'cancelled') access = '<div class="gmw-cancel-note">Webinar Cancelled' + escapeHtml(refundLabel(item)) + '</div>';
    else if (item.status === 'completed') access = '<div style="color:var(--muted)">This webinar has ended.</div>';
    else if (item.link) access = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><span>Your meeting link is ready.</span>' + joinButton(item) + '</div>';
    else access = '<div style="color:var(--muted)">Meeting details will be available here once they are published by the host.</div>';
    var popup = document.createElement('div');
    popup.id = 'gmw-detail';
    popup.className = 'modal-overlay on';
    popup.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="gmw-detail-title" style="max-width:600px">' +
      '<button class="modal-close" type="button" aria-label="Close" onclick="guidcyMyWebinarsAction(\'close\')">×</button>' +
      '<div class="gmw-thumb ' + thumbClass(item) + '" style="border-radius:12px;margin:0 0 14px"><span class="gmw-cat">' + escapeHtml(w.category || 'Webinar') + '</span>' + statusPill(item) + '</div>' +
      '<div id="gmw-detail-title" class="gmw-title" style="font-size:22px;margin-bottom:10px">' + escapeHtml(webinarTitle(w)) + '</div>' +
      '<div class="gmw-speaker" style="margin-bottom:12px">' + speakerAvatar(item, 40) + '<span>' + escapeHtml(w.speaker || w.publisher_name || 'Guidcy host') + (w.speaker_role ? '<small>' + escapeHtml(w.speaker_role) + '</small>' : '') + '</span>' +
      (item.consultantId ? '<button class="bk-btn blue" type="button" style="margin-left:auto" onclick="guidcyMyWebinarsAction(\'speaker\',\'' + escapeHtml(item.consultantId) + '\')">View speaker profile</button>' : '') + '</div>' +
      (w.description ? '<p style="font-size:13.5px;color:var(--ink2);line-height:1.7;margin:0">' + escapeHtml(w.description) + '</p>' : '') +
      '<div class="gmw-detail-list">' +
      field('Date', item.status === 'cancelled' ? '' : formatDate(w.date)) + field('Start time', w.time && formatTime(w.time)) + field('Duration', w.duration) +
      field('Category', w.category) + field('Platform', item.status === 'cancelled' ? '' : modeLabel(item)) + field('Registered on', formatDate(r.registered_at || r.created_at)) +
      field('Payment', priceLabel(item) + (item.paid && (r.razorpay_payment_id || r.payment_id) ? ' · ' + (r.razorpay_payment_id || r.payment_id) : '')) + field('Registration ID', r.id) +
      '</div>' +
      '<div class="gmw-access">' + access + '</div>' +
      '</div>';
    document.body.appendChild(popup);
    popup.addEventListener('click', function (event) { if (event.target === popup) closeMyWebinarDetail(); });
  }

  /* Dashboard → My Webinars, optionally landing on one webinar's details.
     Direct history writes between pages are refused by the app, so go the
     way every other module does: open the dashboard, then pick the tab with
     its own sidebar button so the route controller treats it as a click. */
  function openMyWebinarsTab(detailId) {
    var consultant = lower(currentProfile().role || window.loggedIn) === 'consultant';
    var page = consultant ? 'cons-dash' : 'user-dash';
    myWebinars.pendingDetail = clean(detailId);
    invalidateMyWebinars();
    document.querySelectorAll('#wbn-reg-modal,#booking-confirm-popup').forEach(function (el) {
      el.classList.remove('on');
      if (el.id === 'booking-confirm-popup') el.remove(); else el.style.display = 'none';
    });
    if (typeof window.go === 'function') window.go(page); else { location.href = consultant ? '/consultant-dashboard?tab=my-webinars' : '/dashboard?tab=my-webinars'; return; }
    setTimeout(function () {
      var button = document.querySelector('#page-' + page + ' .side-btn[data-dash-section="my-webinars"]');
      var open = window[consultant ? 'swCD' : 'swUD'];
      if (typeof open === 'function') open('my-webinars', button || null);
      window.scrollTo(0, 0);
    }, 150);
  }
  window.guidcyOpenMyWebinars = openMyWebinarsTab;

  window.guidcyMyWebinarsAction = function (action, value) {
    if (action === 'filter') { myWebinars.filter = value; paintMyWebinars(); return; }
    if (action === 'details') { openMyWebinarDetail(value); return; }
    if (action === 'close') { closeMyWebinarDetail(); return; }
    if (action === 'reload') { invalidateMyWebinars(); window.guidcyRenderMyWebinars(myWebinars.panel, null); return; }
    if (action === 'open') { openMyWebinarsTab(value); return; }
    if (action === 'speaker') { closeMyWebinarDetail(); try { window.openProfile && window.openProfile(value, -1); } catch (_) {} return; }
    if (action === 'explore') { if (typeof window.go === 'function') window.go('webinar'); else location.href = '/webinars'; }
  };

  /* Compact "Upcoming Webinars" block on each dashboard home tab. The home
     renderers repaint their panel more than once, so watch the panel and add
     the block whenever the home title is showing without it. */
  function upcomingHomeHtml(items) {
    return '<section class="gmw-home" id="gmw-home"><div class="gmw-home-head"><b>Upcoming Webinars</b></div>' +
      (items.length
        ? items.map(function (item) {
          var w = item.webinar;
          return '<div class="gmw-home-row"><div style="min-width:0"><div class="gmw-title">' + escapeHtml(webinarTitle(w)) + '</div><div class="gmw-meta"><span>' + escapeHtml(whenLabel(item)) + '</span><span>' + escapeHtml(w.speaker || w.publisher_name || '') + '</span></div></div>' +
            '<div class="gmw-actions"><button class="btn" type="button" onclick="guidcyMyWebinarsAction(\'open\',\'' + escapeHtml(item.id) + '\')">View Details</button>' + joinButton(item) + '</div></div>';
        }).join('') + '<button class="gmw-home-link" type="button" onclick="guidcyMyWebinarsAction(\'open\')">View All Webinars →</button>'
        : '<div style="padding:14px 0 4px"><div style="font-size:14.5px;font-weight:700;color:var(--ink)">No upcoming webinars</div><div style="font-size:13px;color:var(--muted);margin:4px 0 12px">Explore upcoming sessions and learn directly from experts.</div><button class="btn btn-blue" type="button" onclick="guidcyMyWebinarsAction(\'explore\')">Explore Webinars</button></div>') +
      '</section>';
  }
  var homeTitles = { 'udash-main': 'upcoming sessions', 'cdash-main': 'overview' };
  async function injectUpcomingHome(panel) {
    var title = lower(panel.querySelector('.dash-title') && panel.querySelector('.dash-title').textContent);
    /* Opening the dashboard starts its default tab's render before ours; when
       that slow render lands after our cards it wipes them. Paint again from
       cache while My Webinars is still the selected tab. */
    if (title !== 'my webinars' && myWebinars.loadedAt && myWebinarsSelected(panel) && !panel.querySelector('.guidcy-dash-loading')) {
      myWebinars.panel = panel.id === 'cdash-main' ? 'swCD' : 'swUD';
      paintMyWebinars();
      return;
    }
    if (title !== homeTitles[panel.id] || panel.querySelector('#gmw-home') || panel.querySelector('.guidcy-dash-loading')) return;
    if (!accountId() && !accountEmail()) return;
    var placeholder = document.createElement('div');
    placeholder.id = 'gmw-home';
    panel.appendChild(placeholder);
    try { await loadMyWebinars(); } catch (_) { placeholder.remove(); return; }
    if (!placeholder.parentNode) return;
    placeholder.outerHTML = upcomingHomeHtml(sortedMyWebinars('upcoming').slice(0, 3));
  }
  function watchDashboardHome() {
    ['udash-main', 'cdash-main'].forEach(function (id) {
      var panel = byId(id);
      if (!panel || panel.__gmwWatched) return;
      panel.__gmwWatched = true;
      var timer = null;
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { injectUpcomingHome(panel); }, 150);
      }).observe(panel, { childList: true });
    });
  }
  document.addEventListener('DOMContentLoaded', watchDashboardHome);

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
