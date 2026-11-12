#!/usr/bin/env python3
"""v20261111b — leaner Privacy Policy: keep what GDPR Art. 13 requires (data categories, purposes, legal bases,
retention, categories of recipients, transfers, rights) but drop implementation details that make the product
easy to copy or map (analytics method, exact AI inputs and model list, internal tool names, security stack,
provider names that are not needed). Idempotent. Run from the version folder root:
    python3 tools/i18n/legal-privacy-lean.py"""
import os, re

LEG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend', 'src', 'seo', 'legal')

def section(html, sid, new_body):
    m = re.search(r'(<h2 id="%s">[^<]*</h2>\n)(.*?)(?=\n<h2 |\Z)' % sid, html, re.S)
    if not m: raise SystemExit('section %s not found' % sid)
    return html[:m.start(2)] + new_body.strip('\n') + html[m.end(2):]

def head(html, sid, title):
    return re.sub(r'<h2 id="%s">[^<]*</h2>' % sid, '<h2 id="%s">%s</h2>' % (sid, title), html)

def toc(html, sid, title):
    return re.sub(r'(<li><a href="#%s">)[^<]*(</a></li>)' % sid, r'\g<1>%s\g<2>' % title, html)

T = {
'en': {
 'data_h': '2. What we collect, why, and for how long',
 'data': '''<div class="lg-table-wrap">
<table class="lg-table">
  <thead><tr><th>Data</th><th>Why we use it</th><th>Legal basis (GDPR)</th><th>How long we keep it</th></tr></thead>
  <tbody>
    <tr><td data-th="Data"><strong>Account</strong> — email, name, password (never stored in readable form), language</td><td data-th="Why">Create and secure your account and send you service emails (codes, confirmations)</td><td data-th="Legal basis">Contract — Art. 6(1)(b)</td><td data-th="Kept">Until you delete your account</td></tr>
    <tr><td data-th="Data"><strong>Optional profile</strong> — birthday, phone, countries you choose</td><td data-th="Why">Personalise your results and plans</td><td data-th="Legal basis">Contract — only if you add them</td><td data-th="Kept">Until you clear them or delete your account</td></tr>
    <tr><td data-th="Data"><strong>Your answers and results</strong></td><td data-th="Why">Provide your Wikigai and keep your progress</td><td data-th="Legal basis">Contract</td><td data-th="Kept">Until you delete your account</td></tr>
    <tr><td data-th="Data"><strong>What you create or save</strong> — plans, favourites, saved videos</td><td data-th="Why">Keep them available to you</td><td data-th="Legal basis">Contract</td><td data-th="Kept">Until you remove them or delete your account; items you never save are removed automatically after a short period</td></tr>
    <tr><td data-th="Data"><strong>Security and service data</strong> — sign-in codes, abuse-prevention and technical records</td><td data-th="Why">Keep the service secure, reliable and fair</td><td data-th="Legal basis">Legitimate interest</td><td data-th="Kept">Short periods, at most 30 days</td></tr>
    <tr><td data-th="Data"><strong>Anonymous usage statistics</strong> — no cookies, not linked to your account, cannot identify you</td><td data-th="Why">Understand what helps people and improve Wikigai</td><td data-th="Legal basis">Legitimate interest</td><td data-th="Kept">Up to 13 months</td></tr>
    <tr><td data-th="Data"><strong>Messages you send us</strong></td><td data-th="Why">Answer you</td><td data-th="Legal basis">Legitimate interest</td><td data-th="Kept">Up to 24 months</td></tr>
  </tbody>
</table>
</div>
<p>We do not ask for special categories of data (health, religion, political opinions, etc.). We never sell or rent your data or use it for advertising, and we make no decisions about you with legal or similarly significant effects: results, pay ranges and plans are guidance only.</p>''',
 'cookies': '<p>Wikigai uses <strong>one strictly necessary cookie</strong> to keep you signed in, and your browser’s local storage to remember preferences and progress on your device. We use <strong>no advertising or tracking cookies</strong>, so there is nothing to accept or refuse.</p>',
 'ai': '<p>To create profession overviews and study plans, we send AI model providers only the non-identifying information needed for the request (such as the profession and skills you chose, an age range, a country and the language) — <strong>never</strong> your name, email, phone, birthday or account identifiers, so a request cannot be linked back to you. AI answers can be wrong — please check them (see our <a href="/terms">Terms</a>).</p>',
 'videos': '<p>Video searches are made by our server without any information about you. Videos play in YouTube’s privacy-enhanced mode; when you press play, YouTube receives your IP address and may store data on your device under <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">Google’s Privacy Policy</a>.</p>',
 'providers': '''<p>We share personal data only with service providers that help us run Wikigai and act on our instructions under a data processing agreement:</p>
<ul>
  <li>hosting and database provider (European Union);</li>
  <li>email delivery provider (service emails only);</li>
  <li>encrypted backup storage;</li>
  <li>AI model providers — non-identifying requests only (section 4);</li>
  <li>Google — YouTube videos and web fonts (Google receives your IP address when these load).</li>
</ul>
<p>We may disclose data if the law requires it or to protect the safety of users. The current list of providers is available on request.</p>''',
 'transfers': '<p>Our database is hosted in the European Union. Some providers above may process data outside the European Economic Area (for example in the United States). In that case we rely on an adequacy decision (such as the EU–US Data Privacy Framework) or on the European Commission’s Standard Contractual Clauses.</p>',
 'social_tool': ('We schedule these posts with a self-hosted publishing tool (Postiz) that runs on our own server and connects through the platforms’ official APIs (Meta’s Instagram API and TikTok’s Login Kit and Content Posting API).',
                 'We schedule these posts with a publishing tool that runs on our own server and connects through the platforms’ official APIs (Meta’s Instagram API and TikTok’s Login Kit and Content Posting API).'),
 'security': '<p>We protect your data with encryption in transit, encryption of sensitive fields, passwords stored only in non-reversible form, restricted access, abuse protection and encrypted backups. No online service is risk-free: if a personal data breach occurs, we notify the Estonian Data Protection Inspectorate within 72 hours and tell you directly when it is likely to put your rights at high risk, as the GDPR requires.</p>',
},
'fr': {
 'data_h': '2. Données collectées, finalités et durées',
 'data': '''<div class="lg-table-wrap">
<table class="lg-table">
  <thead><tr><th>Données</th><th>Pourquoi</th><th>Base légale (RGPD)</th><th>Durée de conservation</th></tr></thead>
  <tbody>
    <tr><td data-th="Données"><strong>Compte</strong> — e-mail, nom, mot de passe (jamais conservé en clair), langue</td><td data-th="Pourquoi">Créer et sécuriser votre compte, vous envoyer les e-mails du service (codes, confirmations)</td><td data-th="Base légale">Contrat — art. 6.1.b</td><td data-th="Durée">Jusqu’à la suppression du compte</td></tr>
    <tr><td data-th="Données"><strong>Profil facultatif</strong> — date de naissance, téléphone, pays choisis</td><td data-th="Pourquoi">Personnaliser vos résultats et vos plans</td><td data-th="Base légale">Contrat — seulement si vous les ajoutez</td><td data-th="Durée">Jusqu’à ce que vous les effaciez ou supprimiez le compte</td></tr>
    <tr><td data-th="Données"><strong>Vos réponses et résultats</strong></td><td data-th="Pourquoi">Fournir votre Wikigai et garder votre progression</td><td data-th="Base légale">Contrat</td><td data-th="Durée">Jusqu’à la suppression du compte</td></tr>
    <tr><td data-th="Données"><strong>Ce que vous créez ou enregistrez</strong> — plans, favoris, vidéos enregistrées</td><td data-th="Pourquoi">Les garder à votre disposition</td><td data-th="Base légale">Contrat</td><td data-th="Durée">Jusqu’à leur retrait ou la suppression du compte ; les éléments jamais enregistrés sont supprimés automatiquement après une courte période</td></tr>
    <tr><td data-th="Données"><strong>Données de sécurité et de service</strong> — codes de connexion, prévention des abus, journaux techniques</td><td data-th="Pourquoi">Garder le service sûr, fiable et équitable</td><td data-th="Base légale">Intérêt légitime</td><td data-th="Durée">Courtes durées, 30 jours maximum</td></tr>
    <tr><td data-th="Données"><strong>Statistiques d’utilisation anonymes</strong> — sans cookies, non liées à votre compte, ne permettent pas de vous identifier</td><td data-th="Pourquoi">Comprendre ce qui aide les gens et améliorer Wikigai</td><td data-th="Base légale">Intérêt légitime</td><td data-th="Durée">Jusqu’à 13 mois</td></tr>
    <tr><td data-th="Données"><strong>Messages que vous nous envoyez</strong></td><td data-th="Pourquoi">Vous répondre</td><td data-th="Base légale">Intérêt légitime</td><td data-th="Durée">Jusqu’à 24 mois</td></tr>
  </tbody>
</table>
</div>
<p>Nous ne demandons aucune donnée sensible (santé, religion, opinions politiques, etc.). Nous ne vendons ni ne louons jamais vos données et ne les utilisons pas à des fins publicitaires ; nous ne prenons aucune décision produisant des effets juridiques ou similaires à votre égard : résultats, salaires et plans sont des repères.</p>''',
 'cookies': '<p>Wikigai utilise <strong>un seul cookie strictement nécessaire</strong> pour vous garder connecté, ainsi que le stockage local de votre navigateur pour mémoriser vos préférences et votre progression sur votre appareil. Nous n’utilisons <strong>aucun cookie publicitaire ni de suivi</strong> : il n’y a donc rien à accepter ou refuser.</p>',
 'ai': '<p>Pour créer les présentations de métiers et les plans d’études, nous envoyons aux fournisseurs de modèles d’IA uniquement les informations non identifiantes nécessaires à la demande (par exemple le métier et les compétences choisis, une tranche d’âge, un pays et la langue) — <strong>jamais</strong> votre nom, e-mail, téléphone, date de naissance ni identifiant de compte : une demande ne peut donc pas être reliée à vous. Les réponses de l’IA peuvent être erronées — vérifiez-les (voir nos <a href="/terms">Conditions</a>).</p>',
 'videos': '<p>Les recherches de vidéos sont effectuées par notre serveur sans aucune information vous concernant. Les vidéos sont lues en mode de confidentialité renforcée de YouTube ; lorsque vous lancez une vidéo, YouTube reçoit votre adresse IP et peut stocker des données sur votre appareil selon les <a href="https://policies.google.com/privacy?hl=fr" rel="noopener" target="_blank">Règles de confidentialité de Google</a>.</p>',
 'providers': '''<p>Nous ne partageons des données personnelles qu’avec des prestataires qui nous aident à faire fonctionner Wikigai et agissent sur nos instructions dans le cadre d’un contrat de sous-traitance :</p>
<ul>
  <li>hébergeur et base de données (Union européenne) ;</li>
  <li>prestataire d’envoi d’e-mails (e-mails du service uniquement) ;</li>
  <li>stockage chiffré des sauvegardes ;</li>
  <li>fournisseurs de modèles d’IA — demandes non identifiantes uniquement (section 4) ;</li>
  <li>Google — vidéos YouTube et polices web (Google reçoit votre adresse IP à leur chargement).</li>
</ul>
<p>Nous pouvons communiquer des données si la loi l’exige ou pour protéger la sécurité des utilisateurs. La liste à jour des prestataires est disponible sur demande.</p>''',
 'transfers': '<p>Notre base de données est hébergée dans l’Union européenne. Certains prestataires ci-dessus peuvent traiter des données hors de l’Espace économique européen (par exemple aux États-Unis). Dans ce cas, nous nous appuyons sur une décision d’adéquation (comme le Data Privacy Framework UE–États-Unis) ou sur les clauses contractuelles types de la Commission européenne.</p>',
 'social_tool': ('Nous programmons ces publications avec un outil de publication auto-hébergé (Postiz) qui fonctionne sur notre propre serveur et se connecte via les API officielles des plateformes (API Instagram de Meta, Login Kit et Content Posting API de TikTok).',
                 'Nous programmons ces publications avec un outil de publication qui fonctionne sur notre propre serveur et se connecte via les API officielles des plateformes (API Instagram de Meta, Login Kit et Content Posting API de TikTok).'),
 'security': '<p>Nous protégeons vos données par le chiffrement des échanges, le chiffrement des champs sensibles, des mots de passe conservés uniquement sous forme irréversible, un accès restreint, une protection contre les abus et des sauvegardes chiffrées. Aucun service en ligne n’est sans risque : en cas de violation de données personnelles, nous la notifions à l’Inspection estonienne de la protection des données sous 72 heures et vous prévenons directement lorsqu’elle présente un risque élevé pour vos droits, comme l’exige le RGPD.</p>',
},
'es': {
 'data_h': '2. Qué datos recogemos, para qué y durante cuánto tiempo',
 'data': '''<div class="lg-table-wrap">
<table class="lg-table">
  <thead><tr><th>Datos</th><th>Para qué</th><th>Base jurídica (RGPD)</th><th>Plazo de conservación</th></tr></thead>
  <tbody>
    <tr><td data-th="Datos"><strong>Cuenta</strong>: correo, nombre, contraseña (nunca guardada en formato legible), idioma</td><td data-th="Para qué">Crear y proteger tu cuenta y enviarte los correos del servicio (códigos, confirmaciones)</td><td data-th="Base jurídica">Contrato — art. 6.1.b</td><td data-th="Plazo">Hasta que borres tu cuenta</td></tr>
    <tr><td data-th="Datos"><strong>Perfil opcional</strong>: fecha de nacimiento, teléfono, países que elijas</td><td data-th="Para qué">Personalizar tus resultados y planes</td><td data-th="Base jurídica">Contrato — solo si los añades</td><td data-th="Plazo">Hasta que los borres o elimines tu cuenta</td></tr>
    <tr><td data-th="Datos"><strong>Tus respuestas y resultados</strong></td><td data-th="Para qué">Ofrecerte tu Wikigai y guardar tu progreso</td><td data-th="Base jurídica">Contrato</td><td data-th="Plazo">Hasta que borres tu cuenta</td></tr>
    <tr><td data-th="Datos"><strong>Lo que creas o guardas</strong>: planes, favoritos, vídeos guardados</td><td data-th="Para qué">Tenerlos a tu disposición</td><td data-th="Base jurídica">Contrato</td><td data-th="Plazo">Hasta que los quites o borres tu cuenta; lo que nunca guardas se elimina automáticamente tras un periodo corto</td></tr>
    <tr><td data-th="Datos"><strong>Datos de seguridad y del servicio</strong>: códigos de acceso, prevención de abusos y registros técnicos</td><td data-th="Para qué">Mantener el servicio seguro, fiable y justo</td><td data-th="Base jurídica">Interés legítimo</td><td data-th="Plazo">Periodos cortos, 30 días como máximo</td></tr>
    <tr><td data-th="Datos"><strong>Estadísticas de uso anónimas</strong>: sin cookies, no vinculadas a tu cuenta, no permiten identificarte</td><td data-th="Para qué">Saber qué ayuda a la gente y mejorar Wikigai</td><td data-th="Base jurídica">Interés legítimo</td><td data-th="Plazo">Hasta 13 meses</td></tr>
    <tr><td data-th="Datos"><strong>Mensajes que nos envías</strong></td><td data-th="Para qué">Responderte</td><td data-th="Base jurídica">Interés legítimo</td><td data-th="Plazo">Hasta 24 meses</td></tr>
  </tbody>
</table>
</div>
<p>No pedimos categorías especiales de datos (salud, religión, opiniones políticas, etc.). Nunca vendemos ni alquilamos tus datos ni los usamos para publicidad, y no tomamos decisiones sobre ti con efectos jurídicos o similares: los resultados, salarios y planes son orientativos.</p>''',
 'cookies': '<p>Wikigai usa <strong>una sola cookie estrictamente necesaria</strong> para mantener tu sesión iniciada, y el almacenamiento local de tu navegador para recordar preferencias y progreso en tu dispositivo. <strong>No usamos cookies publicitarias ni de seguimiento</strong>, así que no hay nada que aceptar o rechazar.</p>',
 'ai': '<p>Para crear descripciones de profesiones y planes de estudio, enviamos a los proveedores de modelos de IA solo la información no identificativa necesaria (por ejemplo, la profesión y las habilidades elegidas, una franja de edad, un país y el idioma) — <strong>nunca</strong> tu nombre, correo, teléfono, fecha de nacimiento ni identificadores de cuenta, así que una petición no puede vincularse contigo. Las respuestas de la IA pueden tener errores: compruébalas (consulta nuestras <a href="/terms">Condiciones</a>).</p>',
 'videos': '<p>Las búsquedas de vídeos las hace nuestro servidor sin ningún dato sobre ti. Los vídeos se reproducen en el modo de privacidad mejorada de YouTube; al darle a reproducir, YouTube recibe tu dirección IP y puede guardar datos en tu dispositivo según la <a href="https://policies.google.com/privacy?hl=es" rel="noopener" target="_blank">Política de Privacidad de Google</a>.</p>',
 'providers': '''<p>Solo compartimos datos personales con proveedores que nos ayudan a hacer funcionar Wikigai y actúan según nuestras instrucciones mediante un contrato de encargo del tratamiento:</p>
<ul>
  <li>proveedor de alojamiento y base de datos (Unión Europea);</li>
  <li>proveedor de envío de correo (solo correos del servicio);</li>
  <li>almacenamiento cifrado de copias de seguridad;</li>
  <li>proveedores de modelos de IA: solo peticiones no identificativas (sección 4);</li>
  <li>Google: vídeos de YouTube y fuentes web (Google recibe tu IP cuando se cargan).</li>
</ul>
<p>Podemos comunicar datos si la ley lo exige o para proteger la seguridad de los usuarios. La lista actual de proveedores está disponible si la pides.</p>''',
 'transfers': '<p>Nuestra base de datos está alojada en la Unión Europea. Algunos de los proveedores anteriores pueden tratar datos fuera del Espacio Económico Europeo (por ejemplo, en Estados Unidos). En ese caso nos basamos en una decisión de adecuación (como el Marco de Privacidad de Datos UE–EE. UU.) o en las cláusulas contractuales tipo de la Comisión Europea.</p>',
 'social_tool': ('Programamos estas publicaciones con una herramienta de publicación autoalojada (Postiz) que funciona en nuestro propio servidor y se conecta mediante las API oficiales de las plataformas (API de Instagram de Meta, Login Kit y Content Posting API de TikTok).',
                 'Programamos estas publicaciones con una herramienta de publicación que funciona en nuestro propio servidor y se conecta mediante las API oficiales de las plataformas (API de Instagram de Meta, Login Kit y Content Posting API de TikTok).'),
 'security': '<p>Protegemos tus datos con cifrado en las comunicaciones, cifrado de los campos sensibles, contraseñas guardadas solo de forma irreversible, acceso restringido, protección contra abusos y copias de seguridad cifradas. Ningún servicio en línea está libre de riesgos: si se produce una brecha de datos personales, la notificamos a la Inspección Estonia de Protección de Datos en un plazo de 72 horas y te avisamos directamente cuando suponga un riesgo alto para tus derechos, como exige el RGPD.</p>',
},
}

for lang, t in T.items():
    p = os.path.join(LEG, lang, 'privacy.html'); s = open(p, encoding='utf-8').read()
    if 'lean-v1' in s:
        print(lang, 'already lean — skipped'); continue
    s = section(s, 'data', t['data'])
    s = section(s, 'cookies', t['cookies'])
    s = section(s, 'ai', t['ai'])
    s = section(s, 'videos', t['videos'])
    s = section(s, 'providers', t['providers'])
    s = section(s, 'transfers', t['transfers'])
    s = section(s, 'security', t['security'])
    a, b = t['social_tool']; assert a in s, (lang, 'social'); s = s.replace(a, b)
    s = '<!-- lean-v1 -->\n' + s
    open(p, 'w', encoding='utf-8').write(s); print(lang, 'privacy lean ok')
