# Keyword-based finder expert suggestions

Find Jobs had parallel native and adaptive suggestion renderers. The native ranker awarded rating/completeness points without requiring a keyword hit. An additional legacy AI Finder patch expanded queries into broad category dictionaries and awarded rating-only points. Adaptive context also included location, default selects, hidden form fields and modal text, allowing generic terms to qualify unrelated consultants.

Removed those redundant recommendation renderers, fetches, ranking dictionaries and saved recommendation lists. Find Jobs, Career & College AI Finder (both modes), and Funds & Grants Finder now have one shared suggestion section. An explicit AI goal takes priority; otherwise matching uses relevant fields in the active form. Location, salary, default degree/budget, hidden forms, result text and modal content do not broaden the query. Funds category is used only when no keyword is supplied.

The existing expert-match endpoint reads active, approved consultant records and their public profile portfolio entries, using explicit public columns and stable 200-record batches. Matching covers name/headline, category, bio, skills/tags, certifications, company experience, education and portfolio text. Text matching uses word boundaries so short terms such as AI do not match unrelated substrings. JSON property names are not searchable evidence. Typos are corrected against actual profile vocabulary; stronger multi-keyword matches precede incidental mentions. Ratings only order consultants that already qualify. Adaptive requests exclude broad related-expertise expansion and never fill empty results with arbitrary profiles.

Duplicate consultant IDs are removed. Requests are debounced/deduplicated with a 60-second same-query reuse window, a 12-second timeout, cancellation and sequence/context checks. Changed input, switched AI modes, saved-opportunity tabs and navigation invalidate pending suggestions. Failures offer retry without fallback profiles; no matches hide the section. Repeated Funds initialization preserves an in-progress search instead of resetting its input.

No schema, RLS, authentication, production data or booking/payment workflow changes. Returned prices preserve zero-priced sessions and existing video-session price precedence. No frontend or API deployment was performed.

Validation:

- Build and JavaScript syntax/diff checks pass.
- 33 targeted Node checks pass: matching, negative results, natural-language stop words, two-character skills, typos, portfolio/education, eligibility, pagination, deduplication, price preservation, directory fuzzy-search compatibility and opportunity API behavior.
- Browser checks at 390/1280px pass across Jobs, Career AI, College AI and Funds: one section, relevant IDs, defaults/hidden inputs excluded, repeat-search reuse, stale-response rejection, live search, retries and clearing.
- Existing finder-layout browser checks pass at 390/1280px, including search APIs, result refresh, menu/footer layout and 21 routes.
- Read-only production schema/data queries confirmed matching public fields and real keyword matches for polymer, marketing and IIT Roorkee; an unrelated keyword returned none. No production writes.

An unrelated existing test in `experience-description.test.mjs` still expects the retired `guidcy-exp-timeline-about` profile markup. That expectation was absent from HEAD before this change; no profile-rendering code was changed here.

## Suggestion section alignment

The “Need help landing this role?” section now anchors directly after each finder's actual results element, including `opp-results-area` on Funds & Grants. The old selector missed that element and could insert suggestions outside its padded, centered content wrapper. Existing misplaced sections are moved back into the results column. The heading retains consistent space above the cards without the removed description. Browser checks at 320/390/1280px verify both edges of the section, heading and grid match the results column across all four finder modes, alongside the existing functional checks. Build passes; frontend changes remain local.
