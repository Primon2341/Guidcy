-- ════════════════════════════════════════════════════════════
--  GUIDCY — Supabase Database Schema
--  Paste this entire file into: Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════

-- ── Enable UUID extension ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
--  1. PROFILES  (extends Supabase auth.users)
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','consultant','admin')),
  full_name       TEXT,
  email           TEXT,
  phone           TEXT,
  city            TEXT,
  timezone        TEXT DEFAULT 'IST',
  avatar_initials TEXT,
  avatar_url      TEXT,
  notification_pref TEXT DEFAULT 'email_sms',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, avatar_initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 2))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ══════════════════════════════════════════
--  2. CONSULTANTS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.consultants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  avatar_initials TEXT,
  avatar_bg       TEXT DEFAULT '#EBF4FF',
  avatar_color    TEXT DEFAULT '#1E72BE',
  specialty       TEXT,
  category        TEXT,
  bio             TEXT,
  experience      TEXT,
  rate            INTEGER DEFAULT 2000,
  session_types   TEXT[] DEFAULT ARRAY['video'],
  available_days  TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  slots           TEXT[] DEFAULT ARRAY['10:00 AM','2:00 PM','4:00 PM'],
  tags            TEXT[] DEFAULT ARRAY[]::TEXT[],
  certs           TEXT[] DEFAULT ARRAY[]::TEXT[],
  badge           TEXT DEFAULT 'new' CHECK (badge IN ('new','verified','suspended')),
  is_active       BOOLEAN DEFAULT FALSE,
  rating          NUMERIC(3,1) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  total_sessions  INTEGER DEFAULT 0,
  total_earnings  INTEGER DEFAULT 0,
  bank_ifsc       TEXT,
  bank_account    TEXT,
  upi_id          TEXT,
  pan_number      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════
--  3. BOOKINGS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  consultant_id   UUID REFERENCES public.consultants(id) ON DELETE SET NULL,
  consultant_name TEXT,
  user_name       TEXT,
  date_label      TEXT,
  time_slot       TEXT,
  duration        INTEGER DEFAULT 60,
  session_type    TEXT DEFAULT 'video',
  amount          INTEGER,
  platform_fee    INTEGER,
  total_amount    INTEGER,
  status          TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled','pending')),
  payment_id      TEXT,
  payment_method  TEXT,
  meet_link       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════
--  4. REVIEWS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  consultant_id   UUID REFERENCES public.consultants(id) ON DELETE CASCADE,
  booking_id      UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text            TEXT NOT NULL,
  recommend       BOOLEAN DEFAULT TRUE,
  reviewer_name   TEXT,
  aspect_ratings  JSONB DEFAULT '{}',
  is_published    BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update consultant rating after review
CREATE OR REPLACE FUNCTION update_consultant_rating()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating NUMERIC;
  review_cnt INTEGER;
BEGIN
  SELECT AVG(rating), COUNT(*) INTO avg_rating, review_cnt
  FROM public.reviews
  WHERE consultant_id = COALESCE(NEW.consultant_id, OLD.consultant_id)
    AND is_published = TRUE;

  UPDATE public.consultants
  SET rating = ROUND(avg_rating::NUMERIC, 1),
      review_count = review_cnt,
      updated_at = NOW()
  WHERE id = COALESCE(NEW.consultant_id, OLD.consultant_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_review_change ON public.reviews;
CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE PROCEDURE update_consultant_rating();

-- ══════════════════════════════════════════
--  5. NOTIFICATIONS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  is_read   BOOLEAN DEFAULT FALSE,
  type      TEXT DEFAULT 'info',
  link      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════
--  6. SAVED CONSULTANTS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.saved_consultants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES public.consultants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, consultant_id)
);

-- ══════════════════════════════════════════
--  7. ROW-LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Public profiles readable" ON public.profiles FOR SELECT USING (true);

-- Consultants (public read)
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultants publicly readable" ON public.consultants FOR SELECT USING (is_active = true);
CREATE POLICY "Consultants can update own record" ON public.consultants FOR UPDATE
  USING (profile_id = auth.uid());
CREATE POLICY "Admins can manage consultants" ON public.consultants FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own bookings" ON public.bookings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert bookings" ON public.bookings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Consultants see their bookings" ON public.bookings FOR SELECT
  USING (consultant_id IN (SELECT id FROM public.consultants WHERE profile_id = auth.uid()));

-- Reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews publicly readable" ON public.reviews FOR SELECT USING (is_published = true);
CREATE POLICY "Users can write reviews" ON public.reviews FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE USING (user_id = auth.uid());

-- Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Service can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- Saved consultants
ALTER TABLE public.saved_consultants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved" ON public.saved_consultants FOR ALL USING (user_id = auth.uid());

-- ══════════════════════════════════════════
--  8. SEED DATA — Demo consultants
--  (Run after the above; safe to re-run)
-- ══════════════════════════════════════════
INSERT INTO public.consultants (name, avatar_initials, avatar_bg, avatar_color, specialty, category, bio, experience, rate, session_types, available_days, slots, tags, certs, badge, is_active, rating, review_count)
VALUES
  ('Dr. Riya Sharma','RS','#EBF4FF','#1E72BE','Business Strategy','Business','Former McKinsey engagement manager turned startup advisor. Helped 50+ founders from product-market fit to Series B.','8 yrs',2500,ARRAY['video','audio'],ARRAY['Mon','Tue','Thu','Fri'],ARRAY['10:00 AM','11:30 AM','2:00 PM','4:00 PM'],ARRAY['Startup Growth','GTM Strategy','Fundraising','SaaS','Pitch Decks'],ARRAY['MBA — IIM Ahmedabad','McKinsey & Co. Alum','CFA Level II'],'verified',TRUE,4.9,127),
  ('Arjun Kapoor','AK','#E6F1FB','#0C447C','Technology & Engineering','Technology','2× startup CTO, ex-Google. I help technical founders avoid costly architectural decisions.','7 yrs',2000,ARRAY['video','chat'],ARRAY['Mon','Wed','Fri'],ARRAY['9:00 AM','11:00 AM','3:00 PM','5:00 PM'],ARRAY['System Design','CTO Advisory','Product Roadmap','Team Scaling'],ARRAY['B.Tech — IIT Bombay','Ex-Google SWE III','AWS Certified Architect'],'verified',TRUE,4.8,98),
  ('Kavya Nair','KN','#FBEAF0','#72243E','Mental Health & Wellness','Wellness','Licensed psychotherapist specialising in high-achiever burnout and performance anxiety.','10 yrs',1500,ARRAY['video','audio','chat'],ARRAY['Tue','Thu','Sat'],ARRAY['8:00 AM','10:00 AM','12:00 PM','6:00 PM'],ARRAY['Burnout Recovery','Anxiety','CBT','Executive Wellness'],ARRAY['M.Phil Clinical Psychology — NIMHANS','Licensed Psychotherapist'],'verified',TRUE,4.9,214),
  ('Vikram Mehta','VM','#FAEEDA','#633806','Finance & Wealth Planning','Finance','Certified financial planner and former head of wealth at Kotak. Plans for HNIs and founders.','15 yrs',3000,ARRAY['video'],ARRAY['Mon','Tue','Wed','Thu'],ARRAY['10:00 AM','2:00 PM','4:30 PM'],ARRAY['Portfolio Strategy','Tax Planning','FIRE','Equity'],ARRAY['CFP — FPSB India','Ex-Head of Wealth, Kotak','CFA Charterholder'],'verified',TRUE,4.9,182),
  ('Rahul Joshi','RJ','#F1EFE8','#444441','Corporate & Startup Law','Legal','Senior advocate with 12 years in corporate and startup law. 300+ term sheets reviewed.','12 yrs',4000,ARRAY['video','chat'],ARRAY['Tue','Thu','Fri'],ARRAY['11:00 AM','2:00 PM','4:00 PM'],ARRAY['Term Sheets','ESOP','IP Protection','Compliance'],ARRAY['LLB — National Law School Bangalore','Bar Council of India'],'verified',TRUE,4.8,76),
  ('Priya Reddy','PR','#EEEDFE','#3C3489','Career Transition & Coaching','Career','Ex-Amazon PM who coached 200+ professionals into FAANG companies.','6 yrs',1800,ARRAY['video','audio'],ARRAY['Mon','Wed','Sat'],ARRAY['9:30 AM','11:00 AM','2:30 PM','5:00 PM'],ARRAY['FAANG Placement','Resume Building','Interview Prep','Salary Negotiation'],ARRAY['Ex-Amazon PM — L6','ICF Certified Coach'],'new',TRUE,4.7,143)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════
--  Done! Your schema is ready.
--  Next: enable Google Auth in Supabase →
--        Authentication → Providers → Google
-- ══════════════════════════════════════════
