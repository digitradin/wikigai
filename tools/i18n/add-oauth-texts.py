#!/usr/bin/env python3
"""v20261112c — sign in with apps becomes generic (TikTok today; Google, Facebook, Instagram ready but hidden).
- adds the `oauth` block ({provider} = TikTok / Google / Facebook / Instagram) to locales/{en,fr,es}/ui.js
- removes the TikTok-only sign-in texts from the `tiktok` block (now oauth.*)
- adds the emoji caption texts of the Share to TikTok carousel (tiktok.captionDyn…)
Idempotent. Run:  python3 tools/i18n/add-oauth-texts.py   then   node tools/i18n/check.js"""
import json, os, re

LOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'frontend', 'public', 'assets', 'i18n', 'locales')

OAUTH = {
'en': {
 'continue': 'Continue with {provider}', 'or': 'or', 'signupNote': 'One tap — no password. You can add your email later.',
 'errGeneric': '{provider} could not be reached. Please try again.',
 'msgCancel': 'No problem — nothing was shared with {provider}.', 'msgExpired': 'That took too long — please try again.',
 'msgSession': 'Please sign in to Wikigai first, then try again.', 'msgDisabled': 'This account is disabled.',
 'msgLinked': '✓ {provider} is connected. Next time you can use “Continue with {provider}”.',
 'msgMerged': '✓ {provider} is connected and the results from your {provider} sign-up were moved into this account.',
 'msgTaken': 'This {provider} account is already used by another Wikigai account that has an email. Sign in to that account, or use another {provider} account.',
 'msgOther': 'A different {provider} account is already connected. Disconnect it first.',
 'msgMismatch': 'That was not the {provider} account connected to Wikigai — nothing was deleted.',
 'msgEmailExists': 'You already have a Wikigai account with the email of this {provider} account. Sign in with your email, then go to Account › Sign-in methods › Connect {provider}.',
 'msgScope': 'Wikigai needs the permission you unticked to do this. Please try again and allow it.',
 'methodsTitle': 'Sign-in methods', 'methodsHelp': 'Ways you can sign in to this account.',
 'methodEmail': 'Email', 'noEmailYet': 'Not added yet',
 'addEmail': 'Add email', 'addEmailHelp': 'Add your email to sign in from any device, get your 6-month update and recover your account. We’ll send a 6-digit code.',
 'connect': 'Connect', 'connectHelp': 'Sign in with one tap — no password.',
 'connectedAs': 'Connected as {name}', 'disconnect': 'Disconnect',
 'disconnectTitle': 'Disconnect {provider}?', 'disconnectText': 'You won’t be able to sign in with it any more. Your results stay.',
 'needEmail': 'Add your email first, or you would lose access to this account.',
 'deleteHelp': 'Permanently deletes your account, your answers, results and saved items. To confirm it’s you, {provider} will ask you to sign in.',
 'deleteBtn': 'Confirm with {provider}…', 'deleteConfirm': 'This is permanent. You will confirm with {provider}, then everything is deleted.',
 'cardTitle': 'Keep your results safe', 'cardText': 'Add your email to sign in from any device, get your 6-month update and recover your account.',
 'cardEmailPh': 'your@email.com', 'cardSend': 'Send code', 'cardConfirm': 'Confirm', 'cardSkip': 'Not now',
 'cardDone': 'Saved — {email} is now on your account. You can also set a password in Account › Change password.',
 'cardTaken': 'This email already has a Wikigai account. Sign in to it, then go to Account › Sign-in methods › Connect {provider} — your results come with you.',
},
'fr': {
 'continue': 'Continuer avec {provider}', 'or': 'ou', 'signupNote': 'En un geste, sans mot de passe. Vous pourrez ajouter votre e-mail plus tard.',
 'errGeneric': 'Impossible de joindre {provider}. Veuillez réessayer.',
 'msgCancel': 'Pas de souci — rien n’a été partagé avec {provider}.', 'msgExpired': 'C’était trop long — veuillez réessayer.',
 'msgSession': 'Connectez-vous d’abord à Wikigai, puis réessayez.', 'msgDisabled': 'Ce compte est désactivé.',
 'msgLinked': '✓ {provider} est connecté. La prochaine fois, vous pourrez utiliser « Continuer avec {provider} ».',
 'msgMerged': '✓ {provider} est connecté et les résultats de votre inscription {provider} ont été déplacés dans ce compte.',
 'msgTaken': 'Ce compte {provider} est déjà utilisé par un autre compte Wikigai qui a un e-mail. Connectez-vous à ce compte, ou utilisez un autre compte {provider}.',
 'msgOther': 'Un autre compte {provider} est déjà connecté. Déconnectez-le d’abord.',
 'msgMismatch': 'Ce n’était pas le compte {provider} connecté à Wikigai — rien n’a été supprimé.',
 'msgEmailExists': 'Vous avez déjà un compte Wikigai avec l’e-mail de ce compte {provider}. Connectez-vous avec votre e-mail, puis allez dans Compte › Méthodes de connexion › Connecter {provider}.',
 'msgScope': 'Wikigai a besoin de l’autorisation que vous avez décochée. Veuillez réessayer et l’accepter.',
 'methodsTitle': 'Méthodes de connexion', 'methodsHelp': 'Les façons de vous connecter à ce compte.',
 'methodEmail': 'E-mail', 'noEmailYet': 'Pas encore ajouté',
 'addEmail': 'Ajouter un e-mail', 'addEmailHelp': 'Ajoutez votre e-mail pour vous connecter depuis n’importe quel appareil, recevoir votre mise à jour à 6 mois et récupérer votre compte. Nous vous enverrons un code à 6 chiffres.',
 'connect': 'Connecter', 'connectHelp': 'Connexion en un geste, sans mot de passe.',
 'connectedAs': 'Connecté en tant que {name}', 'disconnect': 'Déconnecter',
 'disconnectTitle': 'Déconnecter {provider} ?', 'disconnectText': 'Vous ne pourrez plus vous connecter avec ce compte. Vos résultats restent.',
 'needEmail': 'Ajoutez d’abord votre e-mail, sinon vous perdriez l’accès à ce compte.',
 'deleteHelp': 'Supprime définitivement votre compte, vos réponses, vos résultats et vos éléments enregistrés. Pour confirmer que c’est bien vous, {provider} vous demandera de vous connecter.',
 'deleteBtn': 'Confirmer avec {provider}…', 'deleteConfirm': 'C’est définitif. Vous confirmerez avec {provider}, puis tout sera supprimé.',
 'cardTitle': 'Gardez vos résultats en sécurité', 'cardText': 'Ajoutez votre e-mail pour vous connecter depuis n’importe quel appareil, recevoir votre mise à jour à 6 mois et récupérer votre compte.',
 'cardEmailPh': 'vous@email.com', 'cardSend': 'Envoyer le code', 'cardConfirm': 'Confirmer', 'cardSkip': 'Plus tard',
 'cardDone': 'Enregistré — {email} est maintenant sur votre compte. Vous pouvez aussi définir un mot de passe dans Compte › Changer le mot de passe.',
 'cardTaken': 'Cet e-mail a déjà un compte Wikigai. Connectez-vous à ce compte, puis allez dans Compte › Méthodes de connexion › Connecter {provider} — vos résultats vous suivent.',
},
'es': {
 'continue': 'Continuar con {provider}', 'or': 'o', 'signupNote': 'Con un toque, sin contraseña. Puedes añadir tu email más tarde.',
 'errGeneric': 'No se pudo conectar con {provider}. Inténtalo de nuevo.',
 'msgCancel': 'Sin problema — no se compartió nada con {provider}.', 'msgExpired': 'Tardó demasiado — inténtalo de nuevo.',
 'msgSession': 'Primero inicia sesión en Wikigai y vuelve a intentarlo.', 'msgDisabled': 'Esta cuenta está desactivada.',
 'msgLinked': '✓ {provider} está conectado. La próxima vez puedes usar «Continuar con {provider}».',
 'msgMerged': '✓ {provider} está conectado y los resultados de tu registro con {provider} se movieron a esta cuenta.',
 'msgTaken': 'Esta cuenta de {provider} ya la usa otra cuenta de Wikigai que tiene email. Inicia sesión en esa cuenta o usa otra cuenta de {provider}.',
 'msgOther': 'Ya hay otra cuenta de {provider} conectada. Desconéctala primero.',
 'msgMismatch': 'Esa no era la cuenta de {provider} conectada a Wikigai — no se eliminó nada.',
 'msgEmailExists': 'Ya tienes una cuenta de Wikigai con el email de esta cuenta de {provider}. Inicia sesión con tu email y ve a Cuenta › Métodos de inicio de sesión › Conectar {provider}.',
 'msgScope': 'Wikigai necesita el permiso que desmarcaste. Inténtalo de nuevo y acéptalo.',
 'methodsTitle': 'Métodos de inicio de sesión', 'methodsHelp': 'Las formas de entrar en esta cuenta.',
 'methodEmail': 'Email', 'noEmailYet': 'Aún no añadido',
 'addEmail': 'Añadir email', 'addEmailHelp': 'Añade tu email para entrar desde cualquier dispositivo, recibir tu actualización a los 6 meses y recuperar tu cuenta. Te enviaremos un código de 6 dígitos.',
 'connect': 'Conectar', 'connectHelp': 'Entra con un toque, sin contraseña.',
 'connectedAs': 'Conectado como {name}', 'disconnect': 'Desconectar',
 'disconnectTitle': '¿Desconectar {provider}?', 'disconnectText': 'Ya no podrás entrar con esta cuenta. Tus resultados se quedan.',
 'needEmail': 'Añade primero tu email, o perderías el acceso a esta cuenta.',
 'deleteHelp': 'Elimina para siempre tu cuenta, tus respuestas, resultados y elementos guardados. Para confirmar que eres tú, {provider} te pedirá iniciar sesión.',
 'deleteBtn': 'Confirmar con {provider}…', 'deleteConfirm': 'Es definitivo. Confirmarás con {provider} y después se eliminará todo.',
 'cardTitle': 'Guarda tus resultados', 'cardText': 'Añade tu email para entrar desde cualquier dispositivo, recibir tu actualización a los 6 meses y recuperar tu cuenta.',
 'cardEmailPh': 'tu@email.com', 'cardSend': 'Enviar código', 'cardConfirm': 'Confirmar', 'cardSkip': 'Ahora no',
 'cardDone': 'Guardado — {email} ya está en tu cuenta. También puedes crear una contraseña en Cuenta › Cambiar contraseña.',
 'cardTaken': 'Este email ya tiene una cuenta de Wikigai. Inicia sesión en ella y ve a Cuenta › Métodos de inicio de sesión › Conectar {provider} — tus resultados vienen contigo.',
},
}

# emoji caption of the carousel ({emoji} = top profession, {loves} = "🔬 Science & Technology · 🎨 Creative…", {tags} = domain hashtags)
TIKTOK_ADD = {
'en': {'captionTitleDyn': '{emoji} My ikigai: {career}',
       'captionDyn': '{emoji} My top career match: {career}!\n💖 What I love: {loves}\n🌀 I mapped what I love, what I’m good at, what the world needs and what pays. Which careers would fit YOU? 👇\n#ikigai #careertest #wikigai {tags}',
       'captionDynNoCareer': '💖 What I love: {loves}\n🌀 I’m mapping my ikigai. Which careers would fit YOU? 👇\n#ikigai #careertest #wikigai {tags}'},
'fr': {'captionTitleDyn': '{emoji} Mon ikigai : {career}',
       'captionDyn': '{emoji} Mon métier n°1 : {career} !\n💖 Ce que j’aime : {loves}\n🌀 J’ai cartographié ce que j’aime, ce que je sais faire, ce dont le monde a besoin et ce qui paie. Quels métiers t’iraient à TOI ? 👇\n#ikigai #orientation #wikigai {tags}',
       'captionDynNoCareer': '💖 Ce que j’aime : {loves}\n🌀 Je cartographie mon ikigai. Quels métiers t’iraient à TOI ? 👇\n#ikigai #orientation #wikigai {tags}'},
'es': {'captionTitleDyn': '{emoji} Mi ikigai: {career}',
       'captionDyn': '{emoji} Mi profesión n.º 1: ¡{career}!\n💖 Lo que me encanta: {loves}\n🌀 Mapeé lo que amo, lo que se me da bien, lo que el mundo necesita y lo que paga. ¿Qué profesiones te irían a TI? 👇\n#ikigai #orientacionvocacional #wikigai {tags}',
       'captionDynNoCareer': '💖 Lo que me encanta: {loves}\n🌀 Estoy mapeando mi ikigai. ¿Qué profesiones te irían a TI? 👇\n#ikigai #orientacionvocacional #wikigai {tags}'},
}

# moved to oauth.* (or no longer used)
TIKTOK_DROP = ['continue', 'or', 'signupNote', 'msgCancel', 'msgExpired', 'msgSession', 'msgDisabled', 'msgLinked', 'msgMerged',
  'msgTaken', 'msgOther', 'msgMismatch', 'methodsTitle', 'methodEmail', 'noEmailYet', 'addEmail', 'addEmailHelp', 'connect',
  'connectHelp', 'connectedAs', 'disconnect', 'disconnectTitle', 'disconnectText', 'needEmail', 'deleteHelp', 'deleteBtn',
  'deleteConfirm', 'cardTitle', 'cardText', 'cardEmailPh', 'cardSend', 'cardConfirm', 'cardSkip', 'cardDone', 'cardTaken', 'captionText']

for d in (OAUTH, TIKTOK_ADD):
    assert d['en'].keys() == d['fr'].keys() == d['es'].keys(), set(d['en']) ^ set(d['fr']) ^ set(d['es'])
line = lambda k, v: '    %s: %s,\n' % (k, json.dumps(v, ensure_ascii=False))

for lang in ('en', 'fr', 'es'):
    p = os.path.join(LOC, lang, 'ui.js')
    s = open(p, encoding='utf-8').read()
    a = s.index('\n  tiktok: {\n'); b = s.index('\n  },\n', a)
    block = s[a:b]
    n0 = block.count('\n    ')
    for k in TIKTOK_DROP:
        block = re.sub(r'\n    %s: (?:"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'),(?=\n)' % re.escape(k), '', block)
    dropped = n0 - block.count('\n    ')
    added = 0
    for k, v in TIKTOK_ADD[lang].items():
        if '\n    %s:' % k not in block: block += '\n' + line(k, v).rstrip('\n'); added += 1
    s = s[:a] + block + s[b:]
    if '\n  oauth: {' not in s:
        i = s.rstrip().rfind('});')
        head = s[:i].rstrip()
        if not head.endswith(','): head += ','
        body = ''.join(line(k, v) for k, v in OAUTH[lang].items())
        s = head + '\n  // v20261112c: sign in with apps — {provider} = TikTok, Google, Facebook, Instagram (only the ones switched on are shown)\n  oauth: {\n' + body + '  },\n});\n'
        print(lang, 'oauth: %d keys added;' % len(OAUTH[lang]), end=' ')
    else:
        print(lang, 'oauth already there;', end=' ')
    open(p, 'w', encoding='utf-8').write(s)
    print('tiktok: %d removed, %d added' % (dropped, added))
