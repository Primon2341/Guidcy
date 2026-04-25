# 🚀 Guidcy — Go Live in 30 Minutes

You'll get a real, live website with:
- ✅ Real login (email + Google OAuth)
- ✅ Real payments (UPI, cards, net banking via Razorpay)  
- ✅ Live database (bookings, reviews, profiles saved permanently)
- ✅ Free hosting on Vercel (custom domain supported)

---

## Step 1 — Set up Supabase (Free, 2 minutes)

1. Go to **https://supabase.com** → Sign Up (free)
2. Click **New Project** → Name it `guidcy` → Set a strong DB password → **Create**
3. Wait ~1 min for it to spin up
4. Go to **SQL Editor** (left sidebar) → **New Query**
5. Open `supabase_schema.sql` from this folder → copy everything → paste → **Run**
6. You'll see: *"Success. No rows returned"* — that means it worked ✓

**Get your credentials:**
- Go to **Project Settings → API**
- Copy **Project URL** → this is your `supabase_url`  "https://lsthngfxehayeqyctkla.supabase.co/rest/v1/"
- Copy **anon / public** key → this is your `supabase_key` "sb_publishable_F2rHiYgF_ri26mliWGgqCw_fVKsmp2I"

**Enable Google login (optional but recommended):**
- Go to **Authentication → Providers → Google** → Enable
- Follow the prompts to create a Google OAuth app (takes ~5 min)
- Or skip this — email/password login works out of the box

---

## Step 2 — Set up Razorpay (Free test account, 3 minutes)

1. Go to **https://razorpay.com** → Sign Up
2. Dashboard → **Settings → API Keys** → Generate Test Key
3. Copy your **Key ID** (starts with `rzp_test_`) → this is your `razorpay_key` "rzp_test_Shko313dMXo3WQ"

> 💡 Test mode is fully functional — use card `4111 1111 1111 1111`, any expiry/CVV
> When ready to accept real payments, generate a Live key and complete KYC

---

## Step 3 — Add your credentials to the HTML

Open `index.html` in any text editor (Notepad, VS Code, etc.)

Find these lines near the top of the `<script>` section:

```javascript
const CFG = {
  supabase_url: '',      // ← paste your Supabase URL here
  supabase_key: '',      // ← paste your anon key here  
  razorpay_key: '',      // ← paste your Razorpay key here
};
```

Fill them in like:

```javascript
const CFG = {
  supabase_url: 'https://xyzabcdef.supabase.co',
  supabase_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  razorpay_key: 'rzp_test_xxxxxxxxxxxx',
};
```

Save the file.

---

## Step 4 — Deploy to Vercel (Free, 2 minutes)

**Option A: Drag & drop (easiest)**
1. Go to **https://vercel.com** → Sign Up (free, use GitHub)
2. From your dashboard, click **Add New → Project**
3. Click **"Or deploy from your local files"** (bottom of page)
4. Drag your entire `guidcy-deploy` folder onto the upload zone
5. Click **Deploy** → wait ~30 seconds
6. 🎉 Your site is live! You'll get a URL like `guidcy.vercel.app`

**Option B: GitHub + auto-deploy (recommended for updates)**
1. Create a free GitHub account → New repository named `guidcy`
2. Upload your files there
3. In Vercel: **Add New → Project → Import from GitHub → select `guidcy`**
4. Click **Deploy**
5. Every time you update files on GitHub, Vercel auto-redeploys

---

## Step 5 — Custom domain (optional, ~5 minutes)

1. Buy a domain (e.g. `guidcy.in`) from GoDaddy, Namecheap, or Unstoppable
2. In Vercel: **Project → Settings → Domains → Add domain**
3. Follow the DNS instructions (point your domain's nameservers to Vercel)
4. SSL certificate is auto-generated — your site gets `https://` for free

---

## Step 6 — Make yourself Admin

After signing up on the live site:
1. Go to **Supabase → Table Editor → profiles**
2. Find your row → change `role` from `user` to `admin`
3. Log out and back in on your site → you'll see the **Admin Panel**

---

## After going live

**Add real consultants:**
- They sign up via "Become a Consultant"  
- You approve them in Admin Panel → Manage Consultants → Approve

**Collect real payments:**
- In Razorpay dashboard, complete KYC (submit PAN + bank details)
- Takes 1–2 business days
- Switch `rzp_test_` key to `rzp_live_` key in your HTML

**Send real notifications:**
- Use Supabase Edge Functions + Resend (free tier) for email
- Use Fast2SMS or MSG91 for SMS notifications
- (Optional — the app works without these; users see notifications in-app)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Login doesn't work | Check Supabase URL & key in CFG |
| Payment popup doesn't open | Check Razorpay key starts with `rzp_` |
| Google login fails | Add your Vercel URL to Supabase Auth → URL Configuration → Site URL |
| Data not saving | Check browser console for Supabase errors |
| Site not loading | Check Vercel deployment logs |

**Support:** Check Supabase docs at docs.supabase.com · Razorpay docs at razorpay.com/docs

---

## Cost Summary

| Service | Free tier | When you need to pay |
|---------|-----------|---------------------|
| Supabase | 500MB DB, 50K users | When you exceed free tier |
| Razorpay | No monthly fee | 2% per transaction |
| Vercel | 100GB bandwidth | ~$20/mo when you scale |
| Domain | — | ~₹800–1200/year |

**Total to launch: ₹0** (Razorpay takes 2% only when someone pays you)

---

*Built with ❤️ for Guidcy — India's premier consultation marketplace*
