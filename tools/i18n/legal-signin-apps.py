#!/usr/bin/env python3
"""v20261112c — privacy policy ready for more sign-in apps (Google, Facebook, Instagram) WITHOUT naming them while they are off.
backend/src/seo/legal/<lang>/privacy.html gets conditional blocks, resolved by seo/index.js legalHtml() from the env flags:
  <!--if:google,facebook,instagram--> … <!--/if-->       shown only when at least one of these apps is switched on
  <!--ifnot:facebook,instagram--> … <!--/ifnot-->         shown only when none of them is switched on
  {{signin_apps}}  = the switched-on apps other than TikTok, e.g. "Google and Facebook"
Also makes the delete-my-data page text (legal.delSocial*) app-neutral. Idempotent:  python3 tools/i18n/legal-signin-apps.py"""
import os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LEGAL = os.path.join(ROOT, 'backend', 'src', 'seo', 'legal')
LOC = os.path.join(ROOT, 'frontend', 'public', 'assets', 'i18n', 'locales')
APPS = 'google,facebook,instagram'

T = {
'en': {
 'row': '<tr><td data-th="Data"><strong>Sign-in with {{signin_apps}}</strong> — only if you use it: your account identifier, name and profile picture at that app and, when the app provides it, your verified email address</td><td data-th="Why">Create your account or sign you in, and show which app is connected</td><td data-th="Legal basis">Contract — at your request</td><td data-th="Kept">Until you disconnect the app or delete your account</td></tr>',
 'h3': '<h3>Signing in with {{signin_apps}}</h3>\n<p>You can also create a Wikigai account or sign in with <strong>{{signin_apps}}</strong>, and connect or disconnect them in Account › Sign-in methods. The app gives us your <strong>account identifier, name and profile picture</strong> and, when it provides it, your <strong>verified email address</strong> — nothing else (no contacts, friends, posts, photos or messages). We use them only to sign you in to the same Wikigai account. If a Wikigai account already uses that email, we never join the two by ourselves: you sign in with your email and connect the app from your account. The access token the app gives us is used once to read these details and then revoked or discarded. What the app does with your data is governed by its own privacy policy.</p>',
 'nofb': 'We do not offer sign-in with Facebook or Instagram and import no data from them.',
 'fb': '<li>When you sign in with Facebook or Instagram, we receive only the details listed above; we do not read your friends, followers, posts or messages and we never post for you.</li>',
 'del': '<li><strong>Signed up with {{signin_apps}} and never added an email:</strong> sign in with the same app, then Account › “Delete my account” › “Confirm with …”.</li>',
 'link_old': 'your TikTok sign-in link', 'link_new': 'your sign-in app links (such as TikTok)',
 'delSocialTitle': 'Signed up with TikTok or another app?',
 'delSocial': 'If you signed up with TikTok (or another sign-in app) and never added an email, sign in with that app, then go to Account › Delete my account › Confirm with the same app.',
},
'fr': {
 'row': '<tr><td data-th="Données"><strong>Connexion avec {{signin_apps}}</strong> — uniquement si vous l’utilisez : l’identifiant, le nom et la photo de profil de votre compte sur cette application et, si elle le fournit, votre adresse e-mail vérifiée</td><td data-th="Pourquoi">Créer votre compte ou vous connecter, et afficher l’application connectée</td><td data-th="Base légale">Contrat — à votre demande</td><td data-th="Durée">Jusqu’à ce que vous déconnectiez l’application ou supprimiez votre compte</td></tr>',
 'h3': '<h3>Connexion avec {{signin_apps}}</h3>\n<p>Vous pouvez aussi créer un compte Wikigai ou vous connecter avec <strong>{{signin_apps}}</strong>, et les connecter ou déconnecter dans Compte › Méthodes de connexion. L’application nous transmet <strong>l’identifiant, le nom et la photo de profil</strong> de votre compte et, si elle le fournit, votre <strong>adresse e-mail vérifiée</strong> — rien d’autre (ni contacts, ni amis, ni publications, photos ou messages). Nous les utilisons uniquement pour vous connecter au même compte Wikigai. Si un compte Wikigai utilise déjà cet e-mail, nous ne fusionnons jamais les deux de nous-mêmes : vous vous connectez avec votre e-mail puis connectez l’application depuis votre compte. Le jeton d’accès fourni par l’application sert une seule fois à lire ces informations, puis il est révoqué ou supprimé. Ce que l’application fait de vos données relève de sa propre politique de confidentialité.</p>',
 'nofb': 'Nous ne proposons pas de connexion via Facebook ou Instagram et n’importons aucune donnée de ces plateformes.',
 'fb': '<li>Lorsque vous vous connectez avec Facebook ou Instagram, nous recevons uniquement les informations ci-dessus ; nous ne lisons ni vos amis, ni vos abonnés, ni vos publications ou messages, et nous ne publions jamais à votre place.</li>',
 'del': '<li><strong>Inscrit avec {{signin_apps}} sans avoir ajouté d’e-mail :</strong> connectez-vous avec la même application, puis Compte › « Supprimer mon compte » › « Confirmer avec … ».</li>',
 'link_old': 'votre lien de connexion TikTok', 'link_new': 'vos liens de connexion par application (comme TikTok)',
 'delSocialTitle': 'Inscrit avec TikTok ou une autre application ?',
 'delSocial': 'Si vous vous êtes inscrit avec TikTok (ou une autre application de connexion) sans ajouter d’e-mail, connectez-vous avec cette application, puis allez dans Compte › Supprimer mon compte › Confirmer avec la même application.',
},
'es': {
 'row': '<tr><td data-th="Datos"><strong>Inicio de sesión con {{signin_apps}}</strong>: solo si lo usas: el identificador, el nombre y la foto de perfil de tu cuenta en esa aplicación y, si la aplicación lo facilita, tu email verificado</td><td data-th="Para qué">Crear tu cuenta o iniciar tu sesión, y mostrar qué aplicación está conectada</td><td data-th="Base jurídica">Contrato — a petición tuya</td><td data-th="Plazo">Hasta que desconectes la aplicación o borres tu cuenta</td></tr>',
 'h3': '<h3>Iniciar sesión con {{signin_apps}}</h3>\n<p>También puedes crear una cuenta de Wikigai o iniciar sesión con <strong>{{signin_apps}}</strong>, y conectarlas o desconectarlas en Cuenta › Métodos de inicio de sesión. La aplicación nos da <strong>el identificador, el nombre y la foto de perfil</strong> de tu cuenta y, si lo facilita, tu <strong>email verificado</strong>; nada más (ni contactos, amigos, publicaciones, fotos ni mensajes). Solo los usamos para que entres en la misma cuenta de Wikigai. Si ya hay una cuenta de Wikigai con ese email, nunca unimos las dos por nuestra cuenta: inicias sesión con tu email y conectas la aplicación desde tu cuenta. El token de acceso que nos da la aplicación se usa una sola vez para leer estos datos y después se revoca o se descarta. Lo que la aplicación hace con tus datos se rige por su propia política de privacidad.</p>',
 'nofb': 'No ofrecemos inicio de sesión con Facebook ni Instagram y no importamos datos de esas plataformas.',
 'fb': '<li>Si inicias sesión con Facebook o Instagram, solo recibimos los datos indicados arriba; no leemos tus amigos, seguidores, publicaciones ni mensajes y nunca publicamos por ti.</li>',
 'del': '<li><strong>Te registraste con {{signin_apps}} y nunca añadiste un email:</strong> inicia sesión con la misma aplicación y luego Cuenta › «Eliminar mi cuenta» › «Confirmar con …».</li>',
 'link_old': 'tu vínculo de inicio de sesión de TikTok', 'link_new': 'tus vínculos de inicio de sesión con aplicaciones (como TikTok)',
 'delSocialTitle': '¿Te registraste con TikTok u otra aplicación?',
 'delSocial': 'Si te registraste con TikTok (u otra aplicación de inicio de sesión) y nunca añadiste un email, inicia sesión con esa aplicación y ve a Cuenta › Eliminar mi cuenta › Confirmar con la misma aplicación.',
},
}

def once(s, anchor, insert, after=True, mark=None):
    if (mark or insert) in s: return s, 0
    i = s.find(anchor)
    if i < 0: raise SystemExit('anchor not found: ' + anchor[:60])
    j = i + len(anchor) if after else i
    return s[:j] + insert + s[j:], 1

for lang, t in T.items():
    p = os.path.join(LEGAL, lang, 'privacy.html')
    s = open(p, encoding='utf-8').read(); n = 0
    # 1) data table: a row after the TikTok row
    tt_row = re.search(r'\n(\s*)<tr><td data-th="[^"]+"><strong>[^<]*TikTok[^<]*</strong>.*?</tr>', s).group(0)
    ind = re.match(r'\n(\s*)', tt_row).group(1)
    s, k = once(s, tt_row, '\n' + ind + '<!--if:%s-->%s<!--/if-->' % (APPS, t['row']), mark='<!--if:%s--><tr>' % APPS); n += k
    # 2) section 8: after the "Signing in with TikTok" paragraph (= the paragraph before the 2nd <h3> of the section)
    sec = s.index('<h2 id="social">'); h3b = s.index('<h3>', s.index('<h3>', sec) + 4)
    if '<!--if:%s--><h3>' % APPS not in s:
        s = s[:h3b] + '<!--if:%s-->%s<!--/if-->\n' % (APPS, t['h3']) + s[h3b:]; n += 1
    # 3) "we do not offer Facebook / Instagram sign-in" only while both are off; a privacy line once one is on
    li = '<li>%s</li>' % t['nofb']
    if '<!--ifnot:facebook,instagram-->' not in s:
        s = s.replace(li, '<!--ifnot:facebook,instagram-->%s<!--/ifnot--><!--if:facebook,instagram-->%s<!--/if-->' % (li, t['fb'])); n += 1
    # 4) how to delete: a step for app sign-ups
    tt_step = re.search(r'\n(\s*)<li><strong>[^<]*TikTok[^<]*</strong>[^\n]*</li>', s).group(0)
    s, k = once(s, tt_step, '\n' + re.match(r'\n(\s*)', tt_step).group(1) + '<!--if:%s-->%s<!--/if-->' % (APPS, t['del']), mark='<!--if:%s--><li><strong>' % APPS); n += k
    # 5) what deletion removes
    if t['link_old'] in s: s = s.replace(t['link_old'], t['link_new']); n += 1
    open(p, 'w', encoding='utf-8').write(s)
    # delete page (client side, no app named but TikTok)
    q = os.path.join(LOC, lang, 'ui.js'); u = open(q, encoding='utf-8').read()
    for key in ('delSocialTitle', 'delSocial'):
        u2 = re.sub(r'(\n    %s: )"(?:[^"\\]|\\.)*",' % key, lambda m: m.group(1) + '"' + t[key].replace('"', '\\"') + '",', u, count=1)
        if u2 != u: u = u2; n += 1
    open(q, 'w', encoding='utf-8').write(u)
    print(lang, n, 'changes')
