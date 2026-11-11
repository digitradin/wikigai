#!/usr/bin/env python3
"""v20261029 — Plans "Career & Learning Architect": adds / updates the plan.* texts (profession overview
A1-B8 + study plan v2) in the EN/FR/ES ui.js files. Idempotent: existing keys are replaced in place,
new keys are appended to the plan block.   Usage: python3 tools/i18n/add-plan2-texts.py <version folder>"""
import json, re, sys, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..')
L = {
 'en': dict(
  lead='Pick one profession. We explain it in the simplest way — what it is, its pros and cons, its future, the impact of AI and the 10 skills that matter most. Then you choose 1 to 10 skills and get your own study plan.',
  step2='Profession overview', step3='Your study plan',
  loadingOutlook='Preparing the overview of “{p}”…',
  overviewOf='Profession overview:',
  partA='Understand the profession', partASub='What it is, what people love and dislike, and what is changing now',
  a1='What is this profession? (explained like you’re 12)', a2='Pros and cons', pros='What people love', cons='What people dislike', a3='Current trends',
  partB='Its future', partBSub='Where it is going, AI and robots, and the careers it opens',
  b4='The future of the profession (2030–2035)', b5='Is this job growing or shrinking?',
  dir_growing='Growing', dir_stable='Stable', dir_shrinking='Shrinking',
  demandNow='Current situation', demandNext='Future demand (next 5–10 years)',
  b6='Impact of AI and robots', aiTake='What AI / robots will take over', aiHumans='What humans will still do', aiAdapt='How professionals must adapt',
  b7='Career perspectives', paths='Best possible paths', salary='Realistic salary (per year)', sal_entry='Entry', sal_mid='After ~5 years', sal_top='Top level',
  salEstimate='AI estimate — pay varies by country and employer.', salLink='See official pay data', lifestyle='Freedom and lifestyle',
  b8='Top 10 skills to become a top professional in the future', b8Sub='Ranked from most to least important. Tick the ones you want to learn (1 to 10) — “Learn it” opens hand-picked videos.',
  diff_beginner='Beginner', diff_intermediate='Intermediate', diff_advanced='Advanced',
  selectPrompt='Now select the skills you want to learn (you can choose from 1 to 10). After you select them, we will create a personalized study plan for you.',
  rules='1–2 skills → 30-day plan · 3–5 skills → 3-month plan · 6–10 skills → 1-year plan',
  selectFirst='Select at least one skill above to create your plan.',
  ovTitle='Plan overview', ovSub='Duration, weekly time, main goal and the level you will reach',
  ovDuration='Duration', ovWeekly='Weekly time', ovGoal='Main goal', ovSkills='Selected skills and target level', target='Target',
  stratTitle='Learning strategy', stratCombine='How the skills are combined', stratSequence='Why this sequence',
  phasesTitle='Phase breakdown', schedWeekly='Week-by-week plan', schedMonthly='Month-by-month plan', schedSub='Activities, free resources, a practice project and a review point for each block',
  resources='Free resources:', project='Practice project:', review='Review point:',
  trackTitle='Progress tracking', trackMeasure='How to measure progress', milestones='Milestones',
  adviceTitle='Final advice', motivation='Stay motivated', consistency='Stay consistent',
  overviewAgain='See the profession overview again',
 ),
 'fr': dict(
  lead='Choisis un métier. Nous l’expliquons le plus simplement possible — ce que c’est, ses avantages et inconvénients, son avenir, l’impact de l’IA et les 10 compétences qui comptent le plus. Ensuite tu choisis de 1 à 10 compétences et tu reçois ton plan d’études.',
  step2='Aperçu du métier', step3='Ton plan d’études',
  loadingOutlook='Préparation de l’aperçu de « {p} »…',
  overviewOf='Aperçu du métier :',
  partA='Comprendre le métier', partASub='Ce que c’est, ce qu’on aime et ce qu’on n’aime pas, et ce qui change maintenant',
  a1='C’est quoi, ce métier ? (expliqué comme à tes 12 ans)', a2='Avantages et inconvénients', pros='Ce que les gens adorent', cons='Ce que les gens n’aiment pas', a3='Tendances actuelles',
  partB='Son avenir', partBSub='Où il va, l’IA et les robots, et les carrières qu’il ouvre',
  b4='L’avenir du métier (2030–2035)', b5='Ce métier grandit-il ou recule-t-il ?',
  dir_growing='En croissance', dir_stable='Stable', dir_shrinking='En recul',
  demandNow='Situation actuelle', demandNext='Demande future (5 à 10 ans)',
  b6='Impact de l’IA et des robots', aiTake='Ce que l’IA / les robots vont faire', aiHumans='Ce que les humains feront encore', aiAdapt='Comment les pros doivent s’adapter',
  b7='Perspectives de carrière', paths='Les meilleurs parcours', salary='Salaire réaliste (par an)', sal_entry='Débutant', sal_mid='Après ~5 ans', sal_top='Haut niveau',
  salEstimate='Estimation de l’IA — le salaire varie selon le pays et l’employeur.', salLink='Voir les données officielles', lifestyle='Liberté et mode de vie',
  b8='Les 10 compétences pour devenir un pro de haut niveau demain', b8Sub='De la plus à la moins importante. Coche celles que tu veux apprendre (1 à 10) — « Apprendre » ouvre des vidéos choisies.',
  diff_beginner='Débutant', diff_intermediate='Intermédiaire', diff_advanced='Avancé',
  selectPrompt='Maintenant, choisis les compétences que tu veux apprendre (de 1 à 10). Une fois choisies, nous créerons ton plan d’études personnalisé.',
  rules='1–2 compétences → plan de 30 jours · 3–5 → plan de 3 mois · 6–10 → plan d’1 an',
  selectFirst='Choisis au moins une compétence ci-dessus pour créer ton plan.',
  ovTitle='Aperçu du plan', ovSub='Durée, temps par semaine, objectif principal et niveau visé',
  ovDuration='Durée', ovWeekly='Temps par semaine', ovGoal='Objectif principal', ovSkills='Compétences choisies et niveau visé', target='Visé',
  stratTitle='Stratégie d’apprentissage', stratCombine='Comment les compétences se combinent', stratSequence='Pourquoi cet ordre',
  phasesTitle='Les phases', schedWeekly='Plan semaine par semaine', schedMonthly='Plan mois par mois', schedSub='Activités, ressources gratuites, un projet pratique et un point de révision pour chaque étape',
  resources='Ressources gratuites :', project='Projet pratique :', review='Point de révision :',
  trackTitle='Suivi des progrès', trackMeasure='Comment mesurer tes progrès', milestones='Étapes clés',
  adviceTitle='Derniers conseils', motivation='Rester motivé', consistency='Être régulier',
  overviewAgain='Revoir l’aperçu du métier',
 ),
 'es': dict(
  lead='Elige una profesión. Te la explicamos de la forma más sencilla — qué es, sus ventajas e inconvenientes, su futuro, el impacto de la IA y las 10 competencias que más importan. Después eliges de 1 a 10 competencias y recibes tu plan de estudio.',
  step2='Resumen de la profesión', step3='Tu plan de estudio',
  loadingOutlook='Preparando el resumen de «{p}»…',
  overviewOf='Resumen de la profesión:',
  partA='Entender la profesión', partASub='Qué es, qué gusta y qué no, y qué está cambiando ahora',
  a1='¿Qué es esta profesión? (explicado como si tuvieras 12 años)', a2='Ventajas e inconvenientes', pros='Lo que a la gente le encanta', cons='Lo que a la gente no le gusta', a3='Tendencias actuales',
  partB='Su futuro', partBSub='Hacia dónde va, la IA y los robots, y las carreras que abre',
  b4='El futuro de la profesión (2030–2035)', b5='¿Este trabajo crece o se reduce?',
  dir_growing='En crecimiento', dir_stable='Estable', dir_shrinking='En descenso',
  demandNow='Situación actual', demandNext='Demanda futura (próximos 5–10 años)',
  b6='Impacto de la IA y los robots', aiTake='Lo que harán la IA / los robots', aiHumans='Lo que seguirán haciendo las personas', aiAdapt='Cómo deben adaptarse los profesionales',
  b7='Perspectivas profesionales', paths='Los mejores caminos', salary='Salario realista (al año)', sal_entry='Inicial', sal_mid='Tras ~5 años', sal_top='Nivel alto',
  salEstimate='Estimación de la IA — el salario varía según el país y la empresa.', salLink='Ver datos oficiales', lifestyle='Libertad y estilo de vida',
  b8='Las 10 competencias para ser un gran profesional en el futuro', b8Sub='De la más a la menos importante. Marca las que quieres aprender (de 1 a 10) — «Aprender» abre vídeos seleccionados.',
  diff_beginner='Principiante', diff_intermediate='Intermedio', diff_advanced='Avanzado',
  selectPrompt='Ahora elige las competencias que quieres aprender (de 1 a 10). Cuando las elijas, crearemos tu plan de estudio personalizado.',
  rules='1–2 competencias → plan de 30 días · 3–5 → plan de 3 meses · 6–10 → plan de 1 año',
  selectFirst='Elige al menos una competencia arriba para crear tu plan.',
  ovTitle='Resumen del plan', ovSub='Duración, tiempo semanal, objetivo principal y nivel que alcanzarás',
  ovDuration='Duración', ovWeekly='Tiempo semanal', ovGoal='Objetivo principal', ovSkills='Competencias elegidas y nivel objetivo', target='Objetivo',
  stratTitle='Estrategia de aprendizaje', stratCombine='Cómo se combinan las competencias', stratSequence='Por qué este orden',
  phasesTitle='Fases del plan', schedWeekly='Plan semana a semana', schedMonthly='Plan mes a mes', schedSub='Actividades, recursos gratuitos, un proyecto práctico y un punto de repaso en cada bloque',
  resources='Recursos gratuitos:', project='Proyecto práctico:', review='Punto de repaso:',
  trackTitle='Seguimiento del progreso', trackMeasure='Cómo medir tu progreso', milestones='Hitos',
  adviceTitle='Consejos finales', motivation='Mantén la motivación', consistency='Sé constante',
  overviewAgain='Ver otra vez el resumen de la profesión',
 ),
}
CARD = {'en': 'Pick a profession: what it is, its future, the impact of AI, the top 10 skills — and your own 30-day, 3-month or 1-year study plan.',
        'fr': 'Choisis un métier : ce que c’est, son avenir, l’impact de l’IA, les 10 compétences clés — et ton plan d’études de 30 jours, 3 mois ou 1 an.',
        'es': 'Elige una profesión: qué es, su futuro, el impacto de la IA, las 10 competencias clave — y tu plan de estudio de 30 días, 3 meses o 1 año.'}
for lang in ('en', 'fr', 'es'):
    p = os.path.join(ROOT, 'frontend/public/assets/i18n/locales', lang, 'ui.js')
    s = open(p, encoding='utf-8').read()
    a = s.index('\n  plan: {') + 1
    b = s.index('\n  },', a)
    block = s[a:b]
    add = []
    for k, v in L[lang].items():
        line = f'    {k}: {json.dumps(v, ensure_ascii=False)},'
        rx = re.compile(r'^    ' + re.escape(k) + r': .*,$', re.M)
        if rx.search(block): block = rx.sub(lambda m: line, block, count=1)
        else: add.append(line)
    if add: block = block.rstrip('\n') + '\n    /* v20261029: profession overview + study plan v2 */\n' + '\n'.join(add)
    s = s[:a] + block + s[b:]
    s = re.sub(r'^    plansAiLead: .*,$', lambda m: f'    plansAiLead: {json.dumps(CARD[lang], ensure_ascii=False)},', s, count=1, flags=re.M)
    open(p, 'w', encoding='utf-8').write(s)
    print(lang, 'ok', len(add), 'added')
