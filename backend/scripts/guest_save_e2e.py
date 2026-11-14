# v20261114b — browser test: survey results for visitors → "Continue with Google / TikTok" or email sign-up → results land in the
# account and the visitor is back on the results; home footer + privacy for Google brand verification.
# Needs: backend with EXPOSE_PINS=true, TikTok + Google on via backend/scripts/oauth_standin.mjs, high API_RATE_MAX/AUTH_RATE_MAX.
# Run:   BASE_URL=http://localhost:8095 TT=http://localhost:9915 CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
#        python3 backend/scripts/guest_save_e2e.py      (pip install playwright)
import json, os, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright
B = os.environ.get('BASE_URL', 'http://localhost:8095'); TT = os.environ.get('TT', 'http://localhost:9915')
ok = fail = 0
def check(name, cond, extra=''):
    global ok, fail
    if cond: ok += 1; print('  ✅', name)
    else: fail += 1; print('  ❌', name, extra)
def get(u):
    return urllib.request.urlopen(u).read().decode()

def finish_stage1(page, lang='en'):
    page.goto(f'{B}/survey?stage=1' if lang == 'en' else f'{B}/survey?stage=1&lang={lang}')
    page.wait_for_selector('#beginBtn', state='visible')
    page.click('#beginBtn')
    page.wait_for_selector('#survey.active', timeout=8000)
    for i in range(400):
        if page.locator('#results.active').count(): break
        page.evaluate('window.selectPip([1,5,2,4,1][Math.floor(Math.random()*5)])')
        page.wait_for_timeout(25)
    page.wait_for_selector('#results.active', timeout=10000)

errors = []
FAST = "(()=>{const st=window.setTimeout;window.setTimeout=(f,ms,...a)=>st(f,(ms>=200&&ms<=600)?5:ms,...a);})()"
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
    # ── A. visitor finishes stage 1 → Google ──
    print('— A. visitor, stage 1, Continue with Google —')
    ctx = br.new_context(viewport={'width': 375, 'height': 812}); ctx.add_init_script(FAST); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    finish_stage1(page)
    page.wait_for_selector('#guestSave:not([hidden]) .gs-box', timeout=8000)
    txt = page.inner_text('#guestSave')
    check('box shown under the results', 'Save your results' in txt, txt[:120])
    labels = page.locator('#guestSave [data-gs]').all_inner_texts()
    check('TikTok + Google buttons (same order as /login)', labels == ['Continue with TikTok', 'Continue with Google'], str(labels))
    check('email sign-up link carries next', '/signup?next=%2Fsurvey%3Fstage%3D1%26review%3D1%26saved%3D1' in page.get_attribute('.gs-mail', 'href'))
    check('visitor text: not "saved to your account"; no dashboard button', 'on this device' in page.inner_text('#ctaText') and not page.locator('#goDashBtn').is_visible(), page.inner_text('#ctaText'))
    check('old "Sign in to save" text gone', 'Sign in to save' not in page.inner_text('#saveNote'))
    g = page.evaluate("JSON.parse(localStorage.getItem('wk_guest_results')||'null')")
    check('results kept on the device', bool(g and g['stages']['stage_1'].get('ranked')), str(g)[:120])
    sw = page.evaluate('document.documentElement.scrollWidth')
    check('phone: no horizontal scroll', sw <= 375, str(sw))
    ranked_guest = [r['area'] for r in g['stages']['stage_1']['ranked']]
    get(f'{TT}/__as?open_id=g_e2e_{int(time.time())}&name=Ana%20G&email=ana{int(time.time())}@gmail.com&verified=1')
    page.click('#guestSave [data-gs="google"]')
    page.wait_for_url(re.compile(r'/survey\?stage=1&review=1'), timeout=15000)
    page.wait_for_selector('#results.active', timeout=10000)
    page.wait_for_timeout(800)
    check('back on the results after Google', '/survey?stage=1&review=1' in page.url, page.url)
    check('"Saved to your account" shown', 'Saved to your account' in page.inner_text('#saveNote'), page.inner_text('#saveNote'))
    nb = page.locator('#nextBtn')
    check('Continue to Stage 2 available', nb.is_visible() and '2' in nb.inner_text(), nb.inner_text())
    check('device copy removed', page.evaluate("localStorage.getItem('wk_guest_results')") is None)
    check('guest box gone once signed in', page.locator('#guestSave:not([hidden])').count() == 0)
    tok = page.evaluate("localStorage.getItem('cps_token')")
    req = urllib.request.Request(f'{B}/api/user/results', headers={'Authorization': 'Bearer ' + tok})
    res = json.loads(urllib.request.urlopen(req).read())['results']
    check('account has stage 1 = the guest results', [r['area'] for r in res['stage_1']['ranked']] == ranked_guest)
    nb.click(); page.wait_for_url(re.compile(r'/survey\?stage=2'), timeout=8000)
    check('Continue → stage 2', '/survey?stage=2' in page.url, page.url)
    ctx.close()

    # ── B. visitor stage 1 → email sign-up → code → back to results ──
    print('— B. visitor, stage 1, Sign up with email —')
    ctx = br.new_context(viewport={'width': 1280, 'height': 800}); ctx.add_init_script(FAST); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    finish_stage1(page)
    page.wait_for_selector('#guestSave:not([hidden]) .gs-box', timeout=8000)
    page.click('.gs-mail'); page.wait_for_url(re.compile(r'/signup\?next='), timeout=8000)
    check('signup keeps next', page.evaluate("sessionStorage.getItem('cps_next')") == '/survey?stage=1&review=1&saved=1', str(page.evaluate("sessionStorage.getItem('cps_next')")))
    check('app buttons on /signup too', page.locator('.oa-btns [data-oa]').count() == 2)
    email = f'mail{int(time.time())}@example.com'
    pin = page.evaluate("""async (email) => { const s = await (await fetch('/api/captcha/_debug/solve')).json();
       const r = await (await fetch('/api/auth/signup', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password:'Sunshine42', name:'Mia', captcha_id:s.captcha_id, captcha_answer:s.answer, locale:'en'})})).json();
       sessionStorage.setItem('cps_pending_email', email); return r.dev_pin || r.dummy_pin; }""", email)
    page.goto(f'{B}/verify'); page.wait_for_selector('.pin-row input, input[inputmode="numeric"]', timeout=8000)
    page.locator('.pin-row input, input[inputmode="numeric"]').first.click(); page.keyboard.type(str(pin))
    btn = page.locator('button[type="submit"]')
    if btn.count() and btn.first.is_enabled(): 
        try: btn.first.click(timeout=2000)
        except Exception: pass
    page.wait_for_url(re.compile(r'/survey\?stage=1&review=1'), timeout=15000)
    page.wait_for_selector('#results.active'); page.wait_for_timeout(800)
    check('after the code → back on the results', '/survey?stage=1&review=1' in page.url, page.url)
    check('saved + Continue to Stage 2', 'Saved to your account' in page.inner_text('#saveNote') and page.locator('#nextBtn').is_visible())
    tok = page.evaluate("localStorage.getItem('cps_token')")
    res = json.loads(urllib.request.urlopen(urllib.request.Request(f'{B}/api/user/results', headers={'Authorization': 'Bearer ' + tok})).read())['results']
    check('email account has stage 1', bool(res.get('stage_1', {}).get('ranked')))
    # signed-in user finishing a stage: no guest box
    finish_stage1(page)
    page.wait_for_timeout(1200)
    check('signed in: no guest box, saved note', page.locator('#guestSave:not([hidden])').count() == 0 and 'Saved' in page.inner_text('#saveNote'), page.inner_text('#saveNote'))
    ctx.close()

    # ── C. French + TikTok ──
    print('— C. visitor in French, TikTok —')
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, locale='fr-FR'); ctx.add_init_script(FAST); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'{B}/fr/'); page.wait_for_timeout(500)
    finish_stage1(page)
    page.wait_for_selector('#guestSave:not([hidden]) .gs-box', timeout=8000)
    t = page.inner_text('#guestSave')
    check('French texts', 'Enregistrez vos résultats' in t and 'Continuer avec Google' in t and 'S’inscrire avec un e-mail' in t, t[:160])
    get(f'{TT}/__as?open_id=tt_e2e_{int(time.time())}&name=Leo%20TT')
    page.click('#guestSave [data-gs="tiktok"]')
    page.wait_for_url(re.compile(r'/survey\?stage=1&review=1'), timeout=15000); page.wait_for_selector('#results.active'); page.wait_for_timeout(800)
    check('TikTok → back on results, saved (FR)', 'Enregistr' in page.inner_text('#saveNote') or 'compte' in page.inner_text('#saveNote'), page.inner_text('#saveNote'))
    ctx.close()

    # ── D. legal ──
    print('— D. home footer + privacy —')
    ctx = br.new_context(java_script_enabled=False); page = ctx.new_page()
    page.goto(B + '/')
    check('home: privacy link without JavaScript', page.locator('footer.wk-legal-foot a[href="/privacy"]').count() == 1)
    page.goto(B + '/privacy')
    check('privacy: Google user data paragraph', 'Google API Services User Data Policy' in page.content())
    ctx.close()
    ctx = br.new_context(); page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(B + '/'); page.wait_for_timeout(800)
    check('home with JS: exactly one footer', page.locator('footer.wk-legal-foot').count() == 1)
    ctx.close()
    br.close()
check('no page errors', not errors, '; '.join(errors[:3]))
print(f'\n{"✅ ALL PASS" if not fail else "❌ FAILURES"} — passed={ok} failed={fail}')
