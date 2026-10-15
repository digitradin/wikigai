/* ============================================================
   Wikigai — Stage 1 question BANK (World Discovery)
   The survey builds a fresh, balanced set of paired questions
   from this bank every time someone starts Stage 1:
     • every pair of the 8 areas is asked at least twice
     • no statement or curated pair is shown twice in one run
     • left/right sides and question order are shuffled
   TO ADD QUESTIONS — no code changes needed:
     1. statements: add a line to any area's list. Write it as an
        activity starting with an -ing verb ("Building …") so it fits
        every stem below.
     2. stems: add a question opening that works with any statement.
     3. pairs: add a hand-written pair { text, a, b, areaA, areaB, weight }.
   Area keys: SCIENCE_TECH CREATIVE BUSINESS HEALTH SOCIAL LAW_GOV
              BUILT_ENV NATURE (names/colours live in survey-data.js).
   ============================================================ */
window.STAGE1_BANK = {
 "version": "2026-10-12",
 "questionsPerRun": 70,
 "curatedShare": 0.3,
 "stems": [
  "Given a free afternoon, I'd rather be...",
  "I'd happily spend a whole day...",
  "The project I'd be proudest of would involve...",
  "If I could take one free course, it would be about...",
  "Friends would more likely find me...",
  "I lose track of time when I'm...",
  "In my dream job, I'd spend most days...",
  "Which sounds more like you?",
  "Even if nobody paid me, I'd enjoy...",
  "On a team project, I naturally end up...",
  "Ten years from now, I'd love to be...",
  "Which excites you more?"
 ],
 "statements": {
  "SCIENCE_TECH": [
   "Coding a small app that solves an everyday problem",
   "Taking apart a gadget to see how it works",
   "Running an experiment to test a hunch",
   "Solving a tricky logic or maths puzzle",
   "Teaching a computer to recognise images",
   "Building a robot from a kit",
   "Analysing data to find a hidden pattern",
   "Exploring how black holes or atoms work",
   "Fixing a bug that nobody else could find",
   "Designing a website from scratch",
   "Learning a new programming language",
   "Investigating how a virus behaves in a lab",
   "Tinkering with electronics and circuits",
   "Building a video game with code",
   "Figuring out how search engines rank pages",
   "Testing which of two ideas really works, with numbers",
   "Setting up a home network or smart devices",
   "Reading about the latest AI breakthroughs",
   "Modelling the weather on a computer",
   "Making a 3D printer produce a custom part",
   "Protecting accounts from hackers",
   "Measuring things precisely in a lab",
   "Understanding how DNA carries information",
   "Automating a boring task with a script",
   "Comparing phones or laptops by their specs",
   "Launching a model rocket and tracking its flight",
   "Building a spreadsheet that calculates everything for you",
   "Following space missions and new telescopes",
   "Working out the odds of winning a game",
   "Turning a messy dataset into a clear chart",
   "Finding out why a machine keeps failing",
   "Inventing a gadget that doesn't exist yet"
  ],
  "CREATIVE": [
   "Sketching characters or scenes in a notebook",
   "Designing a poster for an event",
   "Writing a short story or poem",
   "Editing a video with music and effects",
   "Taking photos that tell a story",
   "Designing clothes or customising outfits",
   "Composing a song or a beat",
   "Decorating a room so it feels just right",
   "Creating a logo for a friend's project",
   "Acting or performing in front of an audience",
   "Building an imaginary world for a game or story",
   "Designing how an app looks and feels",
   "Painting or working with clay",
   "Writing the script for a short film",
   "Styling a photoshoot",
   "Making animations or comics",
   "Choosing colours and fonts that work together",
   "Directing a music video",
   "Running a creative social media account",
   "Redesigning a product so it looks beautiful",
   "Writing song lyrics",
   "Making props or costumes",
   "Recording a podcast episode",
   "Designing a book cover",
   "Turning an idea into a mood board",
   "Visiting galleries and design exhibitions",
   "Writing comedy sketches or funny captions",
   "Designing an illustration for someone's wall",
   "Making a short documentary",
   "Styling a table or a shop window",
   "Designing a board game",
   "Creating a dance routine"
  ],
  "BUSINESS": [
   "Selling something I made to real customers",
   "Planning a budget and sticking to it",
   "Pitching an idea to win people over",
   "Running a small business on the side",
   "Negotiating a better deal",
   "Studying why some brands succeed and others fail",
   "Leading a team towards a target",
   "Investing savings and watching them grow",
   "Organising an event so everything runs on time",
   "Making a process faster and cheaper",
   "Reading about start-ups and their founders",
   "Creating a marketing campaign",
   "Setting the right price for a product",
   "Managing a project with deadlines and tasks",
   "Comparing offers to find the best value",
   "Building a network of useful contacts",
   "Understanding how the stock market works",
   "Turning a hobby into a money-making idea",
   "Analysing sales figures to see what works",
   "Hiring and motivating the right people",
   "Planning how a product gets from factory to shop",
   "Advising a friend on a big money decision",
   "Growing customers month after month",
   "Writing a business plan",
   "Spotting an opportunity before others do",
   "Running a fundraiser that beats its target",
   "Making a deal where both sides win",
   "Tracking goals with clear numbers",
   "Designing a loyalty scheme for customers",
   "Running a stall at a market",
   "Understanding why prices go up and down",
   "Being the one who makes the final call"
  ],
  "HEALTH": [
   "Looking after someone who is unwell",
   "Learning how the human body works",
   "Helping a friend recover from an injury",
   "Giving first aid in an emergency",
   "Understanding how medicines work in the body",
   "Supporting someone through stress or anxiety",
   "Planning healthy meals for a family",
   "Coaching someone to get fitter",
   "Shadowing a doctor or nurse for a day",
   "Reading about new medical discoveries",
   "Calming someone who is scared or in pain",
   "Studying how the brain shapes behaviour",
   "Volunteering at a hospital or care home",
   "Learning sign language to help people communicate",
   "Working out why someone feels ill",
   "Helping an older person stay independent",
   "Understanding how diseases spread",
   "Teaching people how to stay healthy",
   "Helping an athlete with recovery exercises",
   "Learning how surgeons operate",
   "Listening carefully to someone's problems",
   "Researching a cure for a disease",
   "Helping a child with speech difficulties",
   "Keeping calm in a medical emergency",
   "Caring for a newborn baby",
   "Understanding how sleep affects health",
   "Designing a fitness programme",
   "Explaining a diagnosis kindly and clearly",
   "Testing blood samples in a lab",
   "Helping someone overcome a phobia",
   "Running a health awareness campaign",
   "Helping someone walk again after an accident"
  ],
  "SOCIAL": [
   "Explaining something until a friend finally gets it",
   "Volunteering for a cause I care about",
   "Mentoring a younger student",
   "Organising a community event",
   "Listening to people's life stories",
   "Helping a new student feel welcome",
   "Running a club or youth group",
   "Understanding why people behave the way they do",
   "Leading a classroom discussion",
   "Supporting a family going through hard times",
   "Planning a lesson that makes learning fun",
   "Raising money for a charity",
   "Bringing together people who don't usually meet",
   "Coaching a kids' sports team",
   "Learning about other cultures and languages",
   "Helping someone with their homework",
   "Campaigning to improve my neighbourhood",
   "Running a workshop for adults",
   "Researching how schools could work better",
   "Helping two friends make up after a fight",
   "Welcoming refugees or newcomers to my town",
   "Designing an online course",
   "Interviewing people about their experiences",
   "Helping someone find a job",
   "Running a debate club",
   "Working with children with special needs",
   "Planning a youth exchange abroad",
   "Building an app that helps people learn",
   "Studying how communities grow and change",
   "Guiding visitors and telling local stories",
   "Being the person friends come to for advice",
   "Improving life for elderly neighbours"
  ],
  "LAW_GOV": [
   "Debating both sides of a controversial issue",
   "Arguing a case so well that people change their minds",
   "Writing rules that make things fairer",
   "Following election night closely",
   "Investigating who is really responsible for a problem",
   "Reading about international politics",
   "Defending someone who has been treated unfairly",
   "Understanding how laws are made",
   "Running for student council",
   "Solving a mystery from the clues",
   "Negotiating peace between two sides",
   "Checking whether a company follows the rules",
   "Studying how crimes are investigated",
   "Writing to a politician about an issue",
   "Working for an international organisation like the UN",
   "Understanding human rights around the world",
   "Taking part in a model parliament or model UN",
   "Drafting a contract that protects everyone",
   "Analysing why countries go to war",
   "Uncovering fraud by following the money",
   "Representing my country abroad",
   "Writing a policy proposal for my town",
   "Studying famous court cases",
   "Helping people understand their rights",
   "Working out what a new law would really change",
   "Reporting on politics and power",
   "Keeping a community safe",
   "Settling a dispute without anyone shouting",
   "Learning how the justice system works",
   "Leading a petition for change",
   "Advising a leader on a tough decision",
   "Interpreting what the rules really mean"
  ],
  "BUILT_ENV": [
   "Designing a dream house",
   "Building furniture with my own hands",
   "Working out how a bridge stays up",
   "Planning a city with parks, transport and homes",
   "Fixing things around the house",
   "Designing a car or motorbike",
   "Building detailed models or LEGO creations",
   "Understanding how skyscrapers are built",
   "Wiring lights and electrics safely",
   "Designing an energy-efficient home",
   "Managing a construction site",
   "Drawing plans and floor layouts",
   "Restoring an old building",
   "Building a treehouse or garden shed",
   "Working out how planes fly",
   "Designing a stadium or concert venue",
   "Improving how traffic flows in a city",
   "Making a machine that moves on its own",
   "Visiting a factory to see how things are made",
   "Designing a better bike or scooter",
   "Installing solar panels",
   "Calculating how much material a project needs",
   "Renovating a room from start to finish",
   "Designing a playground",
   "Understanding how trains and metros work",
   "Building a drone",
   "Inspecting a building to see if it's safe",
   "Designing the interior of a hotel",
   "Planning flood defences for a town",
   "Modelling a building in 3D software",
   "Designing a factory production line",
   "Turning an old warehouse into homes"
  ],
  "NATURE": [
   "Hiking in mountains or forests",
   "Caring for animals",
   "Growing vegetables or plants",
   "Studying marine life",
   "Protecting endangered species",
   "Camping and living outdoors",
   "Researching climate change",
   "Volunteering at an animal shelter",
   "Cleaning up a beach or river",
   "Learning how ecosystems work",
   "Watching birds or wildlife",
   "Working on a farm",
   "Testing the water quality of a river",
   "Making a home more sustainable",
   "Exploring caves, volcanoes or rocks",
   "Training a dog",
   "Diving to explore coral reefs",
   "Planting trees to restore a forest",
   "Developing new plant-based foods",
   "Measuring air pollution in my city",
   "Working as a park ranger",
   "Studying weather and storms",
   "Keeping bees",
   "Treating a sick or injured animal",
   "Designing a garden for wildlife",
   "Helping a business cut its carbon emissions",
   "Understanding where food comes from",
   "Tracking animals in the wild",
   "Studying soils and how crops grow",
   "Sailing and reading the sea",
   "Reusing old materials in creative ways",
   "Campaigning to protect a natural area"
  ]
 },
 "pairs": [
  {
   "text": "When I have free time, I am drawn to...",
   "a": "Tinkering with gadgets or learning new software",
   "b": "Sketching, decorating, or making something visual",
   "areaA": "SCIENCE_TECH",
   "areaB": "CREATIVE",
   "weight": 2
  },
  {
   "text": "I feel most energised when I am...",
   "a": "Pitching an idea or negotiating a deal",
   "b": "Helping someone work through a personal challenge",
   "areaA": "BUSINESS",
   "areaB": "SOCIAL",
   "weight": 2
  },
  {
   "text": "I am naturally curious about...",
   "a": "How the human body works and stays well",
   "b": "How machines, code, or systems are built",
   "areaA": "HEALTH",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I am most fascinated by...",
   "a": "Debating rules, ethics, and how society is governed",
   "b": "Stories, art, music, and self-expression",
   "areaA": "LAW_GOV",
   "areaB": "CREATIVE",
   "weight": 2
  },
  {
   "text": "On a free weekend I'd rather...",
   "a": "Visit a construction site, museum, or design exhibit",
   "b": "Hike, garden, or be near water and wildlife",
   "areaA": "BUILT_ENV",
   "areaB": "NATURE",
   "weight": 1
  },
  {
   "text": "I feel a buzz when I...",
   "a": "Solve a tricky logic puzzle or coding problem",
   "b": "Plan a trip or social event with friends",
   "areaA": "SCIENCE_TECH",
   "areaB": "SOCIAL",
   "weight": 2
  },
  {
   "text": "People who know me well say I...",
   "a": "Always have a creative project on the go",
   "b": "Always have a plan or spreadsheet on the go",
   "areaA": "CREATIVE",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I feel alive when I...",
   "a": "Spot a gap in the market or business opportunity",
   "b": "Spot a flaw in an argument or theory",
   "areaA": "BUSINESS",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I find it meaningful to...",
   "a": "Care directly for someone who is unwell or vulnerable",
   "b": "Build something that lots of people will use",
   "areaA": "HEALTH",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I feel fulfilled when I...",
   "a": "Explain a difficult idea so someone finally gets it",
   "b": "Win a contest, deal, or competitive challenge",
   "areaA": "SOCIAL",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I am drawn to...",
   "a": "Reading about court cases, politics, or world affairs",
   "b": "Reading about scientific discoveries or new design",
   "areaA": "LAW_GOV",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I love looking at...",
   "a": "Buildings, bridges, and how things are constructed",
   "b": "Plants, animals, and ecosystems in nature",
   "areaA": "BUILT_ENV",
   "areaB": "NATURE",
   "weight": 1
  },
  {
   "text": "I feel happiest when I am...",
   "a": "Outdoors with plants, animals, or open landscapes",
   "b": "Indoors with screens, instruments, or a creative project",
   "areaA": "NATURE",
   "areaB": "CREATIVE",
   "weight": 2
  },
  {
   "text": "I am more curious about...",
   "a": "How a disease spreads through a population",
   "b": "How a new app spreads through a user base",
   "areaA": "HEALTH",
   "areaB": "SCIENCE_TECH",
   "weight": 1
  },
  {
   "text": "Given a blank canvas I'd rather...",
   "a": "Make something beautiful and original",
   "b": "Make something profitable and scalable",
   "areaA": "CREATIVE",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I'd rather spend a day...",
   "a": "Mentoring a young person through a tough patch",
   "b": "Diagnosing what is wrong with a patient",
   "areaA": "SOCIAL",
   "areaB": "HEALTH",
   "weight": 1
  },
  {
   "text": "I'd rather argue about...",
   "a": "The fairness of a new public policy",
   "b": "The strategy behind a company's growth",
   "areaA": "LAW_GOV",
   "areaB": "BUSINESS",
   "weight": 1
  },
  {
   "text": "I'd rather design...",
   "a": "A new bridge, building, or transport system",
   "b": "A new piece of software or smart device",
   "areaA": "BUILT_ENV",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I'd rather work to improve...",
   "a": "The health of forests, rivers, and wildlife",
   "b": "The health of individual people",
   "areaA": "NATURE",
   "areaB": "HEALTH",
   "weight": 1
  },
  {
   "text": "I'd rather spend an evening...",
   "a": "Writing, performing, or making something expressive",
   "b": "Volunteering or supporting a community group",
   "areaA": "CREATIVE",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "When something breaks, I...",
   "a": "Want to take it apart and understand how it works",
   "b": "Am mainly concerned with getting it working again fast",
   "areaA": "SCIENCE_TECH",
   "areaB": "BUILT_ENV",
   "weight": 2
  },
  {
   "text": "In a museum I gravitate toward...",
   "a": "Modern art, design, or interactive exhibits",
   "b": "Science, natural history, or engineering galleries",
   "areaA": "CREATIVE",
   "areaB": "SCIENCE_TECH",
   "weight": 1
  },
  {
   "text": "Browsing the news I open...",
   "a": "The business and markets section first",
   "b": "The culture, arts, or science section first",
   "areaA": "BUSINESS",
   "areaB": "CREATIVE",
   "weight": 2
  },
  {
   "text": "I feel proud when I...",
   "a": "Make a sick or stressed person feel better",
   "b": "Make a complex process run more efficiently",
   "areaA": "HEALTH",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I feel most useful when I...",
   "a": "Help others understand themselves and the world",
   "b": "Help a system, machine, or product work better",
   "areaA": "SOCIAL",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I get fired up about...",
   "a": "Injustice, corruption, or unfair rules in society",
   "b": "Bad design, broken processes, or wasted time",
   "areaA": "LAW_GOV",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "Walking through a city I notice...",
   "a": "The architecture, layout, and infrastructure",
   "b": "The people, their interactions, and the community",
   "areaA": "BUILT_ENV",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "I feel calmest when I am...",
   "a": "Surrounded by trees, sea, or open countryside",
   "b": "Surrounded by people, music, and energy",
   "areaA": "NATURE",
   "areaB": "SOCIAL",
   "weight": 2
  },
  {
   "text": "I'd rather understand...",
   "a": "How a microchip processes information",
   "b": "How a skyscraper stays standing",
   "areaA": "SCIENCE_TECH",
   "areaB": "BUILT_ENV",
   "weight": 1
  },
  {
   "text": "Given a new tool I'd rather...",
   "a": "Create something expressive or beautiful with it",
   "b": "Test its technical limits and understand it fully",
   "areaA": "CREATIVE",
   "areaB": "SCIENCE_TECH",
   "weight": 1
  },
  {
   "text": "I'd rather lead...",
   "a": "A growing company into new markets",
   "b": "A campaign to change a law or policy",
   "areaA": "BUSINESS",
   "areaB": "LAW_GOV",
   "weight": 1
  },
  {
   "text": "I feel moved by...",
   "a": "Stories of recovery from illness or injury",
   "b": "Stories of people lifted out of poverty or hardship",
   "areaA": "HEALTH",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "I'd rather influence change through...",
   "a": "Teaching and supporting individuals directly",
   "b": "Reforming laws, policies, and institutions",
   "areaA": "SOCIAL",
   "areaB": "LAW_GOV",
   "weight": 1
  },
  {
   "text": "I'd rather design...",
   "a": "A beautiful building people live and work in",
   "b": "A beautiful object people hold or wear every day",
   "areaA": "BUILT_ENV",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "I'd rather investigate...",
   "a": "How an ecosystem self-regulates and recovers",
   "b": "How a piece of code self-corrects and scales",
   "areaA": "NATURE",
   "areaB": "SCIENCE_TECH",
   "weight": 1
  },
  {
   "text": "I lose track of time when I...",
   "a": "Read about science, tech, or innovation",
   "b": "Read about legal cases, politics, or history",
   "areaA": "SCIENCE_TECH",
   "areaB": "LAW_GOV",
   "weight": 2
  },
  {
   "text": "On social media I save...",
   "a": "Design, art, or creative inspiration",
   "b": "Data, research, or scientific breakthroughs",
   "areaA": "CREATIVE",
   "areaB": "SCIENCE_TECH",
   "weight": 1
  },
  {
   "text": "I get excited when I hear about...",
   "a": "A startup that disrupted a whole industry",
   "b": "A conservation effort that saved a species",
   "areaA": "BUSINESS",
   "areaB": "NATURE",
   "weight": 2
  },
  {
   "text": "I am drawn to stories about...",
   "a": "Doctors, nurses, and medical breakthroughs",
   "b": "Engineers, builders, and feats of construction",
   "areaA": "HEALTH",
   "areaB": "BUILT_ENV",
   "weight": 2
  },
  {
   "text": "I feel deeply about...",
   "a": "Inequality in education and opportunity for young people",
   "b": "Inefficiency in business and waste of resources",
   "areaA": "SOCIAL",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I would rather watch a documentary about...",
   "a": "A landmark court case or political scandal",
   "b": "A scientific discovery that changed everything",
   "areaA": "LAW_GOV",
   "areaB": "SCIENCE_TECH",
   "weight": 2
  },
  {
   "text": "I'd rather visit...",
   "a": "A famous engineering marvel or building site",
   "b": "A famous gallery, theatre, or studio",
   "areaA": "BUILT_ENV",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "A perfect job would let me...",
   "a": "Spend most days outdoors with the natural world",
   "b": "Spend most days working closely with people",
   "areaA": "NATURE",
   "areaB": "SOCIAL",
   "weight": 2
  },
  {
   "text": "I'd rather be known as...",
   "a": "The person who solved a hard technical problem",
   "b": "The person who closed a difficult deal or negotiation",
   "areaA": "SCIENCE_TECH",
   "areaB": "BUSINESS",
   "weight": 1
  },
  {
   "text": "I'd rather use my creativity to...",
   "a": "Express ideas, emotions, and stories through art",
   "b": "Comfort or heal people who are struggling",
   "areaA": "CREATIVE",
   "areaB": "HEALTH",
   "weight": 1
  },
  {
   "text": "I'd rather work in...",
   "a": "A fast, competitive, results-driven environment",
   "b": "A calm, structured, safety-focused environment",
   "areaA": "BUSINESS",
   "areaB": "HEALTH",
   "weight": 1
  },
  {
   "text": "I'd rather influence people through...",
   "a": "Personal conversations, mentoring, and teaching",
   "b": "Writing, performance, or public-facing media",
   "areaA": "SOCIAL",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "I'd rather defend...",
   "a": "A person's legal rights in a courtroom",
   "b": "A child's wellbeing in a school or community",
   "areaA": "LAW_GOV",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "I'd rather lead...",
   "a": "A team building a major infrastructure project",
   "b": "A team launching a new consumer product",
   "areaA": "BUILT_ENV",
   "areaB": "BUSINESS",
   "weight": 1
  },
  {
   "text": "I'd rather work for...",
   "a": "An organisation protecting the natural environment",
   "b": "A company growing market share and profit",
   "areaA": "NATURE",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I am drawn to problems that...",
   "a": "Have a single correct, elegant solution",
   "b": "Have many valid human interpretations",
   "areaA": "SCIENCE_TECH",
   "areaB": "CREATIVE",
   "weight": 2
  },
  {
   "text": "I'd rather attend a class on...",
   "a": "Filmmaking, design, or creative writing",
   "b": "Public speaking, sales, or negotiation",
   "areaA": "CREATIVE",
   "areaB": "BUSINESS",
   "weight": 1
  },
  {
   "text": "I notice...",
   "a": "How shops, brands, and adverts are designed",
   "b": "How communities, cultures, and societies behave",
   "areaA": "BUSINESS",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "I'd rather learn about...",
   "a": "Anatomy, physiology, and human biology",
   "b": "History, political systems, and human societies",
   "areaA": "HEALTH",
   "areaB": "LAW_GOV",
   "weight": 2
  },
  {
   "text": "I'd rather spend a year...",
   "a": "Volunteering with a community or charity abroad",
   "b": "Working in a conservation or wildlife project",
   "areaA": "SOCIAL",
   "areaB": "NATURE",
   "weight": 1
  },
  {
   "text": "I'd rather read...",
   "a": "A long-form article on geopolitics and international law",
   "b": "A long-form piece on a new engineering feat",
   "areaA": "LAW_GOV",
   "areaB": "BUILT_ENV",
   "weight": 1
  },
  {
   "text": "I'd rather solve a problem involving...",
   "a": "Materials, structures, and physical forces",
   "b": "Human feelings, relationships, and behaviour",
   "areaA": "BUILT_ENV",
   "areaB": "SOCIAL",
   "weight": 1
  },
  {
   "text": "I'd rather study...",
   "a": "Climate, ecosystems, and biodiversity",
   "b": "Markets, economies, and global finance",
   "areaA": "NATURE",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "I find beauty in...",
   "a": "Elegant code, equations, or scientific theories",
   "b": "Powerful images, music, or moving stories",
   "areaA": "SCIENCE_TECH",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "I'd rather protect...",
   "a": "The health of a single patient in my care",
   "b": "The health of an entire species or ecosystem",
   "areaA": "HEALTH",
   "areaB": "NATURE",
   "weight": 1
  },
  {
   "text": "I'd rather support someone through...",
   "a": "A learning challenge or life-skills barrier",
   "b": "A medical or mental-health crisis",
   "areaA": "SOCIAL",
   "areaB": "HEALTH",
   "weight": 1
  },
  {
   "text": "I'd rather shape...",
   "a": "The laws and rules a city or country must follow",
   "b": "The physical layout and design of a city",
   "areaA": "LAW_GOV",
   "areaB": "BUILT_ENV",
   "weight": 1
  },
  {
   "text": "I'd rather build...",
   "a": "A brand people instantly recognise and trust",
   "b": "A product people genuinely love to use",
   "areaA": "BUSINESS",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "I'd rather work on...",
   "a": "The technology powering a new platform",
   "b": "The legal or policy framework governing it",
   "areaA": "SCIENCE_TECH",
   "areaB": "LAW_GOV",
   "weight": 1
  },
  {
   "text": "I'd rather design...",
   "a": "A sustainable wildlife reserve or habitat",
   "b": "A sustainable urban neighbourhood or eco-building",
   "areaA": "NATURE",
   "areaB": "BUILT_ENV",
   "weight": 1
  },
  {
   "text": "I am most excited by...",
   "a": "Discovering how something fundamentally works",
   "b": "Persuading a room of people to back my idea",
   "areaA": "SCIENCE_TECH",
   "areaB": "BUSINESS",
   "weight": 2
  },
  {
   "text": "My ideal output is...",
   "a": "Something original that reflects my own vision",
   "b": "Something efficient that precisely meets a brief",
   "areaA": "CREATIVE",
   "areaB": "BUILT_ENV",
   "weight": 2
  },
  {
   "text": "I am at my best when...",
   "a": "The stakes are high and targets are crystal clear",
   "b": "The brief is open and the approach is mine to design",
   "areaA": "BUSINESS",
   "areaB": "CREATIVE",
   "weight": 1
  },
  {
   "text": "I'd find it more rewarding to...",
   "a": "See someone walk out of hospital visibly healthier",
   "b": "See a conservation project reverse a species' decline",
   "areaA": "HEALTH",
   "areaB": "NATURE",
   "weight": 2
  },
  {
   "text": "I'd rather fight for...",
   "a": "Stronger laws to protect human rights",
   "b": "Stronger laws to protect the planet",
   "areaA": "LAW_GOV",
   "areaB": "NATURE",
   "weight": 1
  }
 ]
};
