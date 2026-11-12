#!/usr/bin/env python3
"""v20261111b — switch the Wikigai Privacy Policy and Terms to an Estonian company (Digitradin OÜ):
controller / service-provider identity from {{placeholders}} (filled from server settings), Estonian law,
Estonian Data Protection Inspectorate as lead authority, Harju County Court, Consumer Disputes Committee,
Estonian digital-consent age (13). Idempotent: run from the version folder root.
    python3 tools/i18n/legal-estonia.py"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LEG = os.path.join(ROOT, 'backend', 'src', 'seo', 'legal')

def section(html, sid, new_body):
    """replace everything between <h2 id="sid">…</h2> and the next <h2 (or end) with new_body"""
    m = re.search(r'(<h2 id="%s">[^<]*</h2>\n)(.*?)(?=\n<h2 |\Z)' % sid, html, re.S)
    if not m: raise SystemExit('section %s not found' % sid)
    return html[:m.start(2)] + new_body.strip('\n') + html[m.end(2):]

def last_p(html, sid, new_p):
    """replace the last <p> of a section"""
    m = re.search(r'<h2 id="%s">.*?(?=\n<h2 |\Z)' % sid, html, re.S)
    block = m.group(0)
    i = block.rfind('<p>'); j = block.find('</p>', i) + 4
    block2 = block[:i] + new_p + block[j:]
    return html[:m.start()] + block2 + html[m.end():]

T = {
 'en': {
  'date': ('Last updated: 11 November 2026', 'Last updated: 12 November 2026'),
  'who': '''<p>Wikigai (wikigai.com) is operated by {{entity_line}}. The company is the data controller for the personal data described here, under the EU General Data Protection Regulation (GDPR) and the Estonian Personal Data Protection Act (isikuandmete kaitse seadus). For any privacy question or request, write to <a href="mailto:{{email}}">{{email}}</a>. We reply within one month at the latest. We are not required to appoint a data protection officer for our activity; privacy requests are handled directly by the management board.</p>
{{provider}}''',
  'complain': '<p>For anything else write to <a href="mailto:{{email}}">{{email}}</a>. You can also complain to our lead supervisory authority, the <strong>Estonian Data Protection Inspectorate</strong> (Andmekaitse Inspektsioon, Tatari 39, 10134 Tallinn, <a href="https://www.aki.ee/en" rel="noopener" target="_blank">aki.ee</a>, info@aki.ee), or to the data protection authority of the country where you live or work (for example the AEPD in Spain or the CNIL in France).</p>',
  'ages': ('(14 in Spain, 15 in France, 16 in many other EU countries, 13 in the UK)', '(13 in Estonia, 14 in Spain, 15 in France, 16 in many other EU countries, 13 in the UK)'),
  'breach': ('if a breach is likely to affect you, we will tell you and the competent authority as the law requires.', 'if a personal data breach occurs, we notify the Estonian Data Protection Inspectorate within 72 hours and tell you directly when it is likely to put your rights at high risk, as the GDPR requires.'),
  'agreement': '<p>These terms are an agreement between you and the company that operates Wikigai at wikigai.com (“the service”) — “we”, “us”: {{entity_line}}.</p>\n<p>By creating an account or using the service you accept these terms and our <a href="/privacy">Privacy Policy</a>. If you do not accept them, please do not use the service.</p>',
  'liability': '<p>The service is free. To the extent the law allows, we are not liable for indirect losses, lost opportunities or decisions taken on the basis of results, pay data or AI content. Nothing in these terms limits liability that cannot legally be limited — in particular for intentional breach or gross negligence (Estonian Law of Obligations Act, § 106) or for death and personal injury — or your mandatory rights as a consumer.</p>',
  'law': '''<p>These terms are governed by the laws of the <strong>Republic of Estonia</strong>. If you are a consumer living in another country, you keep the protection of the mandatory consumer laws of that country and may bring a claim before its courts. Other disputes are decided by <strong>Harju County Court</strong> (Harju Maakohus) in Tallinn.</p>
<p>Before going to court, please contact us — most issues are quickly solved. Consumers resident in Estonia can also turn, free of charge, to the <a href="https://ttja.ee/en/consumer-disputes-committee" rel="noopener" target="_blank">Consumer Disputes Committee</a> of the Estonian Consumer Protection and Technical Regulatory Authority (TTJA). Consumers in other EU countries can get free help from their national European Consumer Centre (ECC-Net).</p>''',
  'contact': '''<p>Information about the service provider, as required by the Estonian Information Society Services Act:</p>
{{provider}}''',
  'contact_h': ('<h2 id="contact">14. Contact</h2>', '<h2 id="contact">14. Service provider and contact</h2>'),
 },
 'fr': {
  'date': ('Dernière mise à jour : 11 novembre 2026', 'Dernière mise à jour : 12 novembre 2026'),
  'who': '''<p>Wikigai (wikigai.com) est exploité par {{entity_line}}. La société est responsable du traitement des données personnelles décrites ici, au titre du Règlement général sur la protection des données (RGPD) et de la loi estonienne sur la protection des données personnelles (isikuandmete kaitse seadus). Pour toute question ou demande, écrivez à <a href="mailto:{{email}}">{{email}}</a>. Nous répondons au plus tard sous un mois. Notre activité n’impose pas la désignation d’un délégué à la protection des données ; les demandes sont traitées directement par la direction.</p>
{{provider}}''',
  'complain': '<p>Pour toute autre demande, écrivez à <a href="mailto:{{email}}">{{email}}</a>. Vous pouvez aussi saisir notre autorité de contrôle chef de file, l’<strong>Inspection estonienne de la protection des données</strong> (Andmekaitse Inspektsioon, Tatari 39, 10134 Tallinn, <a href="https://www.aki.ee/en" rel="noopener" target="_blank">aki.ee</a>, info@aki.ee), ou l’autorité du pays où vous vivez ou travaillez (par exemple la CNIL en France ou l’AEPD en Espagne).</p>',
  'ages': ('(15 ans en France, 14 ans en Espagne, 16 ans dans de nombreux autres pays de l’UE, 13 ans au Royaume-Uni)', '(13 ans en Estonie, 15 ans en France, 14 ans en Espagne, 16 ans dans de nombreux autres pays de l’UE, 13 ans au Royaume-Uni)'),
  'breach': ('si une violation est susceptible de vous concerner, nous vous en informerons, ainsi que l’autorité compétente, comme la loi l’exige.', 'en cas de violation de données personnelles, nous la notifions à l’Inspection estonienne de la protection des données sous 72 heures et vous prévenons directement lorsqu’elle présente un risque élevé pour vos droits, comme l’exige le RGPD.'),
  'agreement': '<p>Les présentes conditions constituent un accord entre vous et la société qui exploite Wikigai sur wikigai.com (« le service ») — « nous » : {{entity_line}}.</p>\n<p>En créant un compte ou en utilisant le service, vous acceptez ces conditions et notre <a href="/privacy">Politique de confidentialité</a>. Si vous ne les acceptez pas, merci de ne pas utiliser le service.</p>',
  'liability': '<p>Le service est gratuit. Dans la mesure permise par la loi, nous ne sommes pas responsables des pertes indirectes, des occasions perdues ni des décisions prises sur la base des résultats, des salaires ou des contenus IA. Rien dans ces conditions ne limite une responsabilité qui ne peut légalement l’être — notamment en cas de manquement intentionnel ou de faute lourde (loi estonienne sur les obligations, § 106), de décès ou de dommage corporel — ni vos droits impératifs de consommateur.</p>',
  'law': '''<p>Ces conditions sont régies par le droit de la <strong>République d’Estonie</strong>. Si vous êtes un consommateur résidant dans un autre pays, vous conservez la protection des lois impératives de ce pays et pouvez saisir ses tribunaux. Les autres litiges relèvent du <strong>tribunal de comté de Harju</strong> (Harju Maakohus) à Tallinn.</p>
<p>Avant toute action, contactez-nous — la plupart des problèmes se règlent vite. Les consommateurs résidant en Estonie peuvent aussi saisir gratuitement la <a href="https://ttja.ee/en/consumer-disputes-committee" rel="noopener" target="_blank">Commission des litiges de consommation</a> de l’Autorité estonienne de protection des consommateurs (TTJA). Les consommateurs d’autres pays de l’UE peuvent obtenir une aide gratuite auprès de leur Centre européen des consommateurs (réseau ECC-Net).</p>''',
  'contact': '''<p>Informations sur le prestataire, conformément à la loi estonienne sur les services de la société de l’information :</p>
{{provider}}''',
  'contact_h': ('<h2 id="contact">14. Contact</h2>', '<h2 id="contact">14. Prestataire et contact</h2>'),
 },
 'es': {
  'date': ('Última actualización: 11 de noviembre de 2026', 'Última actualización: 12 de noviembre de 2026'),
  'who': '''<p>Wikigai (wikigai.com) está operado por {{entity_line}}. La sociedad es la responsable del tratamiento de los datos personales descritos aquí conforme al Reglamento General de Protección de Datos (RGPD) y a la ley estonia de protección de datos personales (isikuandmete kaitse seadus). Para cualquier pregunta o solicitud sobre privacidad, escribe a <a href="mailto:{{email}}">{{email}}</a>. Respondemos en un plazo máximo de un mes. Nuestra actividad no obliga a nombrar un delegado de protección de datos; las solicitudes las atiende directamente la dirección.</p>
{{provider}}''',
  'complain': '<p>Para cualquier otra cosa, escribe a <a href="mailto:{{email}}">{{email}}</a>. También puedes reclamar ante nuestra autoridad de control principal, la <strong>Inspección Estonia de Protección de Datos</strong> (Andmekaitse Inspektsioon, Tatari 39, 10134 Tallin, <a href="https://www.aki.ee/en" rel="noopener" target="_blank">aki.ee</a>, info@aki.ee), o ante la autoridad del país donde vives o trabajas (por ejemplo, la AEPD en España o la CNIL en Francia).</p>',
  'ages': ('(14 años en España, 15 en Francia, 16 en muchos otros países de la UE, 13 en el Reino Unido)', '(13 años en Estonia, 14 en España, 15 en Francia, 16 en muchos otros países de la UE, 13 en el Reino Unido)'),
  'breach': ('si una brecha puede afectarte, te avisaremos a ti y a la autoridad competente según exige la ley.', 'si se produce una brecha de datos personales, la notificamos a la Inspección Estonia de Protección de Datos en un plazo de 72 horas y te avisamos directamente cuando suponga un riesgo alto para tus derechos, como exige el RGPD.'),
  'agreement': '<p>Estas condiciones son un acuerdo entre tú y la sociedad que opera Wikigai en wikigai.com («el servicio») —«nosotros»—: {{entity_line}}.</p>\n<p>Al crear una cuenta o usar el servicio aceptas estas condiciones y nuestra <a href="/privacy">Política de privacidad</a>. Si no las aceptas, no uses el servicio.</p>',
  'liability': '<p>El servicio es gratuito. En la medida en que la ley lo permita, no respondemos de pérdidas indirectas, oportunidades perdidas ni decisiones tomadas a partir de resultados, salarios o contenido de IA. Nada en estas condiciones limita la responsabilidad que no puede limitarse legalmente —en particular por incumplimiento intencionado o culpa grave (Ley estonia de obligaciones, § 106), o por muerte o lesiones— ni tus derechos imperativos como consumidor.</p>',
  'law': '''<p>Estas condiciones se rigen por la ley de la <strong>República de Estonia</strong>. Si eres un consumidor que vive en otro país, mantienes la protección de las leyes imperativas de consumo de ese país y puedes acudir a sus tribunales. Los demás conflictos corresponden al <strong>Tribunal del Condado de Harju</strong> (Harju Maakohus) en Tallin.</p>
<p>Antes de ir a juicio, contáctanos: la mayoría de los problemas se resuelven rápido. Los consumidores residentes en Estonia también pueden acudir gratis a la <a href="https://ttja.ee/en/consumer-disputes-committee" rel="noopener" target="_blank">Comisión de Conflictos de Consumo</a> de la Autoridad Estonia de Protección del Consumidor (TTJA). Los consumidores de otros países de la UE pueden recibir ayuda gratuita de su Centro Europeo del Consumidor (red ECC-Net).</p>''',
  'contact': '''<p>Información sobre el prestador del servicio, según exige la ley estonia de servicios de la sociedad de la información:</p>
{{provider}}''',
  'contact_h': ('<h2 id="contact">14. Contacto</h2>', '<h2 id="contact">14. Prestador del servicio y contacto</h2>'),
 },
}

for lang, t in T.items():
    # privacy
    p = os.path.join(LEG, lang, 'privacy.html'); s = open(p, encoding='utf-8').read()
    if '{{entity_line}}' in s:
        print(lang, 'privacy already Estonian — skipped')
    else:
        s = s.replace(*t['date'])
        s = section(s, 'who', t['who'])
        s = last_p(s, 'rights', t['complain'])
        assert t['ages'][0] in s, (lang, 'ages'); s = s.replace(*t['ages'])
        assert t['breach'][0] in s, (lang, 'breach'); s = s.replace(*t['breach'])
        s = s.replace('admin@digitradin.cloud', '{{email}}')
        open(p, 'w', encoding='utf-8').write(s); print(lang, 'privacy ok')
    # terms
    p = os.path.join(LEG, lang, 'terms.html'); s = open(p, encoding='utf-8').read()
    if '{{entity_line}}' in s:
        print(lang, 'terms already Estonian — skipped'); continue
    s = s.replace(*t['date'])
    s = section(s, 'agreement', t['agreement'])
    s = section(s, 'liability', t['liability'])
    s = section(s, 'law', t['law'])
    assert t['contact_h'][0] in s, (lang, 'contact heading'); s = s.replace(*t['contact_h'])
    s = section(s, 'contact', t['contact'])
    assert t['ages'][0] in s, (lang, 'terms ages'); s = s.replace(*t['ages'])
    s = s.replace('admin@digitradin.cloud', '{{email}}')
    open(p, 'w', encoding='utf-8').write(s); print(lang, 'terms ok')
