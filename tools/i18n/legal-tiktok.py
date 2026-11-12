#!/usr/bin/env python3
"""v20261112b — Privacy Policy, Terms and Delete-my-data texts for "Continue with TikTok" + "Share to TikTok" (EN/FR/ES).
Idempotent. Run from the version folder:  python3 tools/i18n/legal-tiktok.py"""
import os, re, json

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LEG = os.path.join(ROOT, 'backend', 'src', 'seo', 'legal')
LOC = os.path.join(ROOT, 'frontend', 'public', 'assets', 'i18n', 'locales')

def section(html, sid, title, body):
    m = re.search(r'<h2 id="%s">[^<]*</h2>\n(.*?)(?=\n<h2 |\Z)' % sid, html, re.S)
    if not m: raise SystemExit('section %s not found' % sid)
    return html[:m.start()] + '<h2 id="%s">%s</h2>\n%s' % (sid, title, body.strip('\n')) + html[m.end():]

T = {
'en': {
 'row_after': '<tr><td data-th="Data"><strong>What you create or save</strong>',
 'row': '<tr><td data-th="Data"><strong>TikTok sign-in and sharing</strong> — only if you use them: your TikTok account identifier, display name and profile picture; a temporary access token; the images you choose to post</td><td data-th="Why">Sign you in with TikTok, show which account you post to, and publish what you choose when you press Post</td><td data-th="Legal basis">Contract — at your request</td><td data-th="Kept">Sign-in link: until you disconnect TikTok or delete your account. Access token and images: 24 hours at most</td></tr>',
 'toc': '8. Social media, TikTok sign-in and sharing',
 'social_title': '8. Social media, TikTok sign-in and sharing',
 'social': '''<h3>Signing in with TikTok</h3>
<p>You can create a Wikigai account or sign in with <strong>“Continue with TikTok”</strong>, and connect or disconnect TikTok in Account › Sign-in methods. TikTok then gives us your <strong>TikTok account identifier, display name and profile picture</strong> — nothing else (no email, contacts, videos or messages). We use them only to sign you in to the same Wikigai account and to show which TikTok account is connected. The access token TikTok gives us at sign-in is revoked straight away. If you signed up with TikTok, we ask you once — you can skip it — to add your email, so you can recover your account.</p>
<h3>Sharing to TikTok</h3>
<p>If you choose <strong>“Share to TikTok”</strong>, TikTok asks you to authorise Wikigai to post on your behalf. On the post screen you see the account you are posting to, preview the images and choose the caption, who can view the post and the other settings. <strong>Nothing is sent to TikTok until you press Post.</strong> The images are created from your results, stored on our server only so TikTok can fetch them, and deleted within 24 hours. The access token is stored encrypted and deleted within 24 hours; we never keep a long-term token. We do not read your videos, followers or messages. You can disconnect TikTok at any time in Account › Sign-in methods or in the TikTok app (Settings and privacy › Security › Manage app permissions). What TikTok does with your data is governed by <a href="https://www.tiktok.com/legal/privacy-policy" rel="noopener" target="_blank">TikTok’s Privacy Policy</a>.</p>
<h3>Our own social media accounts</h3>
<ul>
  <li>Wikigai publishes on its own accounts, including Instagram <strong>@wikigai_com</strong> and TikTok <strong>@wikigai.com</strong>, with a publishing tool that runs on our own server and connects only Wikigai’s brand accounts through the platforms’ official APIs. It does not collect data about our followers.</li>
  <li>When you follow, like or comment on our accounts, the platform’s own privacy policy applies. We see only what the platform shows publicly (such as your username and comments) and use it only to reply and moderate.</li>
  <li>Links in our posts carry a campaign tag (UTM) so our anonymous statistics can tell which post brought a visit — this never identifies you.</li>
  <li>We do not offer sign-in with Facebook or Instagram and import no data from them.</li>
</ul>''',
 'del_after': '  <li><strong>By email:</strong>',
 'del_li': '  <li><strong>Signed up with TikTok and never added an email:</strong> sign in with TikTok, then Account › “Delete my account” › “Confirm with TikTok”.</li>\n',
 'del_extra': ('saved videos and pending codes.', 'saved videos, pending codes, your TikTok sign-in link, access token and images.'),
 'terms_after': '<h2 id="ip">',
 'terms': '''<h2 id="thirdparty">7b. Posting to TikTok and other platforms</h2>
<p>When you share to TikTok or another platform through Wikigai, you choose what is posted and you are responsible for it, and that platform’s own terms apply (for TikTok: its Terms of Service, Music Usage Confirmation and, for commercial content, its Branded Content Policy). Wikigai never posts without you pressing Post.</p>

''',
 'delsocial': 'If you signed up with TikTok and never added an email, sign in with TikTok, then go to Account › Delete my account › Confirm with TikTok. To remove a comment you left on our posts, delete it on the platform or email us and we will remove it.',
 'delsocial_title': 'Signed up with TikTok?',
},
'fr': {
 'row_after': '<tr><td data-th="Données"><strong>Ce que vous créez ou enregistrez</strong>',
 'row': '<tr><td data-th="Données"><strong>Connexion et partage TikTok</strong> — uniquement si vous les utilisez : l’identifiant de votre compte TikTok, votre nom affiché et votre photo de profil ; un jeton d’accès temporaire ; les images que vous choisissez de publier</td><td data-th="Pourquoi">Vous connecter avec TikTok, afficher le compte sur lequel vous publiez, et publier ce que vous choisissez quand vous appuyez sur Publier</td><td data-th="Base légale">Contrat — à votre demande</td><td data-th="Durée">Lien de connexion : jusqu’à ce que vous déconnectiez TikTok ou supprimiez votre compte. Jeton et images : 24 heures maximum</td></tr>',
 'toc': '8. Réseaux sociaux, connexion et partage TikTok',
 'social_title': '8. Réseaux sociaux, connexion et partage TikTok',
 'social': '''<h3>Se connecter avec TikTok</h3>
<p>Vous pouvez créer un compte Wikigai ou vous connecter avec <strong>« Continuer avec TikTok »</strong>, et connecter ou déconnecter TikTok dans Compte › Méthodes de connexion. TikTok nous transmet alors <strong>l’identifiant de votre compte TikTok, votre nom affiché et votre photo de profil</strong> — rien d’autre (ni e-mail, ni contacts, ni vidéos, ni messages). Nous les utilisons uniquement pour vous connecter au même compte Wikigai et afficher le compte TikTok connecté. Le jeton d’accès reçu à la connexion est révoqué immédiatement. Si vous vous êtes inscrit avec TikTok, nous vous proposons une fois — c’est facultatif — d’ajouter votre e-mail pour pouvoir récupérer votre compte.</p>
<h3>Partager sur TikTok</h3>
<p>Si vous choisissez <strong>« Partager sur TikTok »</strong>, TikTok vous demande d’autoriser Wikigai à publier en votre nom. Sur l’écran de publication, vous voyez le compte utilisé, l’aperçu des images, et choisissez la légende, qui peut voir la publication et les autres réglages. <strong>Rien n’est envoyé à TikTok avant que vous appuyiez sur Publier.</strong> Les images sont créées à partir de vos résultats, conservées sur notre serveur uniquement pour que TikTok puisse les récupérer, et supprimées sous 24 heures. Le jeton d’accès est stocké chiffré et supprimé sous 24 heures ; nous ne conservons aucun jeton de longue durée. Nous ne lisons ni vos vidéos, ni vos abonnés, ni vos messages. Vous pouvez déconnecter TikTok à tout moment dans Compte › Méthodes de connexion ou dans l’appli TikTok (Paramètres et confidentialité › Sécurité › Gérer les autorisations des applis). Le traitement effectué par TikTok relève de la <a href="https://www.tiktok.com/legal/privacy-policy" rel="noopener" target="_blank">politique de confidentialité de TikTok</a>.</p>
<h3>Nos propres comptes de réseaux sociaux</h3>
<ul>
  <li>Wikigai publie sur ses propres comptes, dont Instagram <strong>@wikigai_com</strong> et TikTok <strong>@wikigai.com</strong>, avec un outil de publication qui fonctionne sur notre propre serveur et ne connecte que les comptes de la marque via les API officielles des plateformes. Il ne collecte aucune donnée sur nos abonnés.</li>
  <li>Lorsque vous suivez, aimez ou commentez nos comptes, la politique de confidentialité de la plateforme s’applique. Nous ne voyons que ce que la plateforme affiche publiquement (votre nom d’utilisateur, vos commentaires) et ne l’utilisons que pour répondre et modérer.</li>
  <li>Les liens de nos publications portent une balise de campagne (UTM) pour que nos statistiques anonymes sachent quelle publication a amené une visite — cela ne vous identifie jamais.</li>
  <li>Nous ne proposons pas de connexion via Facebook ou Instagram et n’importons aucune donnée de ces plateformes.</li>
</ul>''',
 'del_after': '  <li><strong>Par e-mail :</strong>',
 'del_li': '  <li><strong>Inscrit avec TikTok sans avoir ajouté d’e-mail :</strong> connectez-vous avec TikTok, puis Compte › « Supprimer mon compte » › « Confirmer avec TikTok ».</li>\n',
 'del_extra': ('vidéos enregistrées et codes en attente.', 'vidéos enregistrées, codes en attente, ainsi que votre lien de connexion TikTok, jeton d’accès et images.'),
 'terms_after': '<h2 id="ip">',
 'terms': '''<h2 id="thirdparty">7b. Publier sur TikTok et d’autres plateformes</h2>
<p>Lorsque vous partagez sur TikTok ou une autre plateforme via Wikigai, vous choisissez ce qui est publié et vous en êtes responsable, et les conditions de cette plateforme s’appliquent (pour TikTok : ses Conditions d’utilisation, sa Confirmation d’utilisation de la musique et, pour le contenu commercial, sa Politique relative au contenu de marque). Wikigai ne publie jamais sans que vous appuyiez sur Publier.</p>

''',
 'delsocial': 'Si vous vous êtes inscrit avec TikTok sans ajouter d’e-mail, connectez-vous avec TikTok, puis Compte › Supprimer mon compte › Confirmer avec TikTok. Pour retirer un commentaire laissé sur nos publications, supprimez-le sur la plateforme ou écrivez-nous et nous le retirerons.',
 'delsocial_title': 'Inscrit avec TikTok ?',
},
'es': {
 'row_after': '<tr><td data-th="Datos"><strong>Lo que creas o guardas</strong>',
 'row': '<tr><td data-th="Datos"><strong>Inicio de sesión y compartir con TikTok</strong>: solo si los usas: el identificador de tu cuenta de TikTok, tu nombre visible y tu foto de perfil; un token de acceso temporal; las imágenes que eliges publicar</td><td data-th="Para qué">Iniciar sesión con TikTok, mostrar en qué cuenta publicas y publicar lo que eliges cuando pulsas Publicar</td><td data-th="Base jurídica">Contrato — a petición tuya</td><td data-th="Plazo">Vínculo de inicio de sesión: hasta que desconectes TikTok o borres tu cuenta. Token e imágenes: 24 horas como máximo</td></tr>',
 'toc': '8. Redes sociales, inicio de sesión y compartir con TikTok',
 'social_title': '8. Redes sociales, inicio de sesión y compartir con TikTok',
 'social': '''<h3>Iniciar sesión con TikTok</h3>
<p>Puedes crear una cuenta de Wikigai o iniciar sesión con <strong>«Continuar con TikTok»</strong>, y conectar o desconectar TikTok en Cuenta › Formas de iniciar sesión. TikTok nos da entonces <strong>el identificador de tu cuenta de TikTok, tu nombre visible y tu foto de perfil</strong>; nada más (ni correo, ni contactos, ni vídeos, ni mensajes). Los usamos solo para iniciar sesión en la misma cuenta de Wikigai y mostrar qué cuenta de TikTok está conectada. El token de acceso que recibimos al iniciar sesión se revoca al momento. Si te registraste con TikTok, te pedimos una vez —puedes saltarlo— que añadas tu correo para poder recuperar tu cuenta.</p>
<h3>Compartir en TikTok</h3>
<p>Si eliges <strong>«Compartir en TikTok»</strong>, TikTok te pide que autorices a Wikigai a publicar en tu nombre. En la pantalla de publicación ves la cuenta en la que publicas, la vista previa de las imágenes y eliges el texto, quién puede ver la publicación y los demás ajustes. <strong>No se envía nada a TikTok hasta que pulsas Publicar.</strong> Las imágenes se crean a partir de tus resultados, se guardan en nuestro servidor solo para que TikTok pueda descargarlas y se borran en un plazo de 24 horas. El token de acceso se guarda cifrado y se borra en un plazo de 24 horas; nunca guardamos tokens de larga duración. No leemos tus vídeos, seguidores ni mensajes. Puedes desconectar TikTok cuando quieras en Cuenta › Formas de iniciar sesión o en la app de TikTok (Ajustes y privacidad › Seguridad › Gestionar permisos de apps). Lo que TikTok hace con tus datos se rige por la <a href="https://www.tiktok.com/legal/privacy-policy" rel="noopener" target="_blank">Política de privacidad de TikTok</a>.</p>
<h3>Nuestras propias cuentas en redes sociales</h3>
<ul>
  <li>Wikigai publica en sus propias cuentas, entre ellas Instagram <strong>@wikigai_com</strong> y TikTok <strong>@wikigai.com</strong>, con una herramienta de publicación que funciona en nuestro propio servidor y solo conecta las cuentas de la marca mediante las API oficiales de las plataformas. No recoge datos de nuestros seguidores.</li>
  <li>Cuando sigues, das «me gusta» o comentas en nuestras cuentas, se aplica la política de privacidad de la plataforma. Solo vemos lo que la plataforma muestra públicamente (tu nombre de usuario y tus comentarios) y lo usamos solo para responder y moderar.</li>
  <li>Los enlaces de nuestras publicaciones llevan una etiqueta de campaña (UTM) para que nuestras estadísticas anónimas sepan qué publicación trajo una visita; nunca te identifica.</li>
  <li>No ofrecemos inicio de sesión con Facebook ni Instagram y no importamos datos de esas plataformas.</li>
</ul>''',
 'del_after': '  <li><strong>Por correo:</strong>',
 'del_li': '  <li><strong>Te registraste con TikTok y nunca añadiste un correo:</strong> inicia sesión con TikTok y ve a Cuenta › «Eliminar mi cuenta» › «Confirmar con TikTok».</li>\n',
 'del_extra': ('vídeos guardados y códigos pendientes.', 'vídeos guardados, códigos pendientes, y tu vínculo de inicio de sesión de TikTok, token de acceso e imágenes.'),
 'terms_after': '<h2 id="ip">',
 'terms': '''<h2 id="thirdparty">7b. Publicar en TikTok y otras plataformas</h2>
<p>Cuando compartes en TikTok u otra plataforma a través de Wikigai, tú eliges lo que se publica y eres responsable de ello, y se aplican las condiciones de esa plataforma (en TikTok: sus Condiciones del servicio, su Confirmación de uso de música y, para contenido comercial, su Política de contenido de marca). Wikigai nunca publica sin que pulses Publicar.</p>

''',
 'delsocial': 'Si te registraste con TikTok y no añadiste un correo, inicia sesión con TikTok y ve a Cuenta › Eliminar mi cuenta › Confirmar con TikTok. Para quitar un comentario que dejaste en nuestras publicaciones, bórralo en la plataforma o escríbenos y lo retiraremos.',
 'delsocial_title': '¿Te registraste con TikTok?',
},
}

for lang, t in T.items():
    p = os.path.join(LEG, lang, 'privacy.html'); s = open(p, encoding='utf-8').read()
    if 'id="social">8. ' in s and '<h3>' in s:
        print(lang, 'privacy already has TikTok texts — skipped')
    else:
        assert t['row_after'] in s, (lang, 'row'); s = s.replace(t['row_after'], t['row'] + '\n    ' + t['row_after'], 1)
        s = re.sub(r'(<li><a href="#social">)[^<]*(</a></li>)', r'\g<1>%s\g<2>' % t['toc'], s)
        s = section(s, 'social', t['social_title'], t['social'])
        assert t['del_after'] in s, (lang, 'delete li'); s = s.replace(t['del_after'], t['del_li'] + t['del_after'], 1)
        assert t['del_extra'][0] in s, (lang, 'delete extra'); s = s.replace(*t['del_extra'])
        open(p, 'w', encoding='utf-8').write(s); print(lang, 'privacy ok')
    p = os.path.join(LEG, lang, 'terms.html'); s = open(p, encoding='utf-8').read()
    if 'id="thirdparty"' in s:
        print(lang, 'terms already done — skipped')
    else:
        assert t['terms_after'] in s; s = s.replace(t['terms_after'], t['terms'] + t['terms_after'], 1)
        open(p, 'w', encoding='utf-8').write(s); print(lang, 'terms ok')
    # delete-my-data sidebar (ui.js legal.delSocialTitle / legal.delSocial)
    p = os.path.join(LOC, lang, 'ui.js'); s = open(p, encoding='utf-8').read()
    s2 = re.sub(r'(\n    delSocialTitle: )"[^"\n]*"', lambda m: m.group(1) + json.dumps(t['delsocial_title'], ensure_ascii=False), s, count=1)
    s2 = re.sub(r'(\n    delSocial: )"[^"\n]*"', lambda m: m.group(1) + json.dumps(t['delsocial'], ensure_ascii=False), s2, count=1)
    if s2 != s: open(p, 'w', encoding='utf-8').write(s2); print(lang, 'delete page texts ok')
