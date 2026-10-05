// Hand-written GameScript (schema v1). Phase 2 replaces this with AI-generated output.
// Question helper: q(conceptId, prompt, options, correctIndex, explanation, difficulty)
let _qid = 0;
const q = (conceptId, prompt, options, correctIndex, explanation, difficulty = 1) => ({
  id: "q" + ++_qid, conceptId, prompt, options, correctIndex, explanation, difficulty,
});

window.SAMPLE_SCRIPT = {
  schemaVersion: 1,
  projectId: "demo_photosynthesis",
  title: "Photosynthesis",
  audience: { level: "general", modes: ["student", "teacher"] },
  chapters: [
    {
      id: "ch1",
      title: "Light Reactions",
      goal: "Explain how light energy becomes chemical energy",
      theme: { background: "crystal_cave" },
      concepts: [
        { id: "c1", name: "Chlorophyll" },
        { id: "c2", name: "Thylakoids (where light reactions happen)" },
        { id: "c3", name: "Products of light reactions" },
      ],
      scenes: [
        {
          type: "npc", id: "ch1s1", conceptIds: ["c1"],
          npc: { name: "Professor Lumen", look: "lumen" },
          dialogue: [
            { text: "Welcome, traveller! Plants make their own food using sunlight. This is called photosynthesis.", highlight: ["photosynthesis"] },
            { text: "The green pigment chlorophyll captures the light. Think of it as a solar panel inside every leaf.", highlight: ["chlorophyll"] },
            { text: "Chlorophyll mostly absorbs red and blue light and reflects green, which is why leaves look green.", highlight: ["red and blue", "green"] },
          ],
          teacherNote: "Ask students to predict why plants look green before revealing the answer.",
        },
        {
          type: "obstacle", id: "ch1s2",
          question: q("c1", "Which pigment absorbs light for photosynthesis?", ["Chlorophyll", "Keratin", "Melanin", "Insulin"], 0, "Chlorophyll absorbs mainly red and blue light.", 1),
          hint: "Re-read the Professor's words: the green pigment.",
        },
        {
          type: "npc", id: "ch1s3", conceptIds: ["c2", "c3"],
          npc: { name: "Archivist Thyla", look: "thyla" },
          dialogue: [
            { text: "The light reactions happen inside the thylakoid membranes of the chloroplast. They are stacked like pancakes into grana.", highlight: ["thylakoid", "grana"] },
            { text: "Light splits water molecules. This releases oxygen as a by-product.", highlight: ["splits water", "oxygen"] },
            { text: "The energy is stored in two carrier molecules: ATP and NADPH. They travel on to the next stage!", highlight: ["ATP", "NADPH"] },
          ],
          teacherNote: "Draw the chloroplast on the board and label thylakoid, grana and stroma.",
        },
        {
          type: "obstacle", id: "ch1s4",
          question: q("c2", "Where in the chloroplast do the light reactions occur?", ["Thylakoid membranes", "Stroma", "Nucleus", "Cell wall"], 0, "Light reactions occur on the thylakoid membranes.", 1),
          hint: "Think pancakes: stacked membranes called grana.",
        },
        {
          type: "match", id: "ch1s5",
          opponent: { name: "Rival Ranger", kind: "rival", skill: 0.6 },
          questions: [
            q("c1", "Chlorophyll mainly absorbs which colours of light?", ["Red and blue", "Green only", "Yellow only", "All colours equally"], 0, "Green is reflected, which is why leaves look green.", 1),
            q("c3", "Which gas is released as a by-product of the light reactions?", ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], 0, "Oxygen comes from the splitting of water.", 1),
            q("c3", "The oxygen released comes from the splitting of:", ["Water", "Carbon dioxide", "Glucose", "ATP"], 0, "Photolysis splits water molecules.", 2),
            q("c3", "Which molecules carry energy from the light reactions to the Calvin cycle?", ["ATP and NADPH", "DNA and RNA", "Glucose and starch", "O2 and CO2"], 0, "ATP and NADPH are the energy carriers.", 2),
            q("c1", "Why do most leaves look green?", ["Chlorophyll reflects green light", "Chlorophyll absorbs green light", "Leaves have no pigment", "Water is green"], 0, "Reflected light is what we see.", 2),
          ],
        },
        {
          type: "mission", id: "ch1s6", conceptIds: ["c3"],
          mission: {
            kind: "order",
            instruction: "Mission: put the steps of the light reactions in the correct order.",
            items: ["Light hits chlorophyll", "Water is split", "Electrons move along the chain", "ATP and NADPH are made"],
          },
        },
        {
          type: "maze", id: "ch1s6b", title: "Maze Run", ghosts: 2,
          questions: [
            q("c1", "Which organelle contains chlorophyll?", ["Chloroplast", "Nucleus", "Ribosome", "Cell wall"], 0, "Chlorophyll sits inside chloroplasts.", 1),
            q("c3", "Splitting water in the light reactions releases:", ["Oxygen, electrons and protons", "Glucose", "Nitrogen", "Starch"], 0, "Photolysis gives O2, electrons and H+.", 2),
            q("c2", "The light reactions happen inside which organelle?", ["Chloroplast", "Mitochondrion", "Golgi body", "Lysosome"], 0, "Chloroplasts host photosynthesis.", 1),
          ],
        },
        {
          type: "level_test", id: "ch1s7", passMark: 4,
          questions: [
            q("c2", "The light reactions need which energy source?", ["Sunlight", "Heat from soil", "Glucose", "Wind"], 0, "Light energy drives the process.", 1),
            q("c2", "Thylakoids are stacked into:", ["Grana", "Vacuoles", "Ribosomes", "Lysosomes"], 0, "A stack of thylakoids is a granum.", 1),
            q("c3", "Which molecule is split in the light reactions?", ["Water", "Glucose", "Starch", "Oxygen"], 0, "Water is split, releasing O2.", 2),
            q("c3", "ATP stands for:", ["Adenosine triphosphate", "Adenine tri-phenol", "Atomic transfer protein", "Active thylakoid pigment"], 0, "ATP is the cell's energy currency.", 2),
            q("c3", "Which is NOT a product of the light reactions?", ["Glucose", "ATP", "NADPH", "Oxygen"], 0, "Glucose is made later, in the Calvin cycle.", 3),
          ],
        },
        { type: "mini_boss", id: "ch1s8", boss: { name: "Warlord Kragg", kind: "enforcer", fight: "martial" }, pool: "chapter", count: 6 },
      ],
    },
    {
      id: "ch2",
      title: "The Calvin Cycle",
      goal: "Explain how CO2 is turned into sugar",
      theme: { background: "ancient_forest" },
      concepts: [
        { id: "c4", name: "Calvin cycle (stroma)" },
        { id: "c5", name: "Carbon fixation and RuBisCO" },
        { id: "c6", name: "Glucose and the overall equation" },
      ],
      scenes: [
        {
          type: "npc", id: "ch2s1", conceptIds: ["c4", "c5"],
          npc: { name: "Ranger Stroma", look: "ranger" },
          dialogue: [
            { text: "Welcome to the stroma, the fluid inside the chloroplast. This is where the Calvin cycle runs.", highlight: ["stroma", "Calvin cycle"] },
            { text: "The cycle uses the ATP and NADPH from the light reactions. It does not need light directly, so it is also called the light-independent reactions.", highlight: ["ATP", "NADPH", "light-independent"] },
            { text: "First, the enzyme RuBisCO fixes carbon dioxide from the air into an organic molecule.", highlight: ["RuBisCO", "carbon dioxide"] },
          ],
          teacherNote: "Contrast this with chapter 1: light reactions make energy carriers, the Calvin cycle spends them.",
        },
        {
          type: "obstacle", id: "ch2s2",
          question: q("c4", "Where does the Calvin cycle take place?", ["Stroma", "Thylakoid membrane", "Mitochondria", "Outside the cell"], 0, "The stroma is the fluid around the thylakoids.", 1),
          hint: "It's the fluid inside the chloroplast.",
        },
        {
          type: "npc", id: "ch2s3", conceptIds: ["c6"],
          npc: { name: "Sage Glucose", look: "sage" },
          dialogue: [
            { text: "The cycle builds sugar. Six carbon dioxide molecules fixed over time make one glucose.", highlight: ["six", "glucose"] },
            { text: "The overall equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2.", highlight: ["6CO2", "C6H12O6"] },
            { text: "Extra glucose is stored in the plant as starch.", highlight: ["starch"] },
          ],
          teacherNote: "Have students balance the equation themselves on paper.",
        },
        {
          type: "obstacle", id: "ch2s4",
          question: q("c6", "The Calvin cycle uses ATP and NADPH to make:", ["Sugar from CO2", "Oxygen from water", "Chlorophyll", "DNA"], 0, "It fixes CO2 into sugar.", 1),
          hint: "Think about what the whole process is for: food.",
        },
        {
          type: "match", id: "ch2s5",
          opponent: { name: "Rival Ranger", kind: "rival", skill: 0.65 },
          questions: [
            q("c5", "Which enzyme fixes CO2 in the Calvin cycle?", ["RuBisCO", "Amylase", "Pepsin", "Lipase"], 0, "RuBisCO catalyses carbon fixation.", 1),
            q("c5", "Carbon enters the Calvin cycle as:", ["CO2", "O2", "N2", "H2"], 0, "CO2 from the air.", 1),
            q("c5", "The first stable product of carbon fixation is:", ["3-PGA", "Glucose", "Pyruvate", "Ethanol"], 0, "3-phosphoglycerate (3-PGA).", 3),
            q("c4", "Why is the Calvin cycle called light-independent?", ["It uses stored ATP and NADPH, not light directly", "It happens only at night", "It needs no energy", "It makes oxygen"], 0, "Light isn't used directly, but the cycle depends on the energy carriers.", 2),
            q("c6", "What is the main sugar produced?", ["Glucose", "Lactose", "Cellulose only", "Fat"], 0, "Glucose, C6H12O6.", 1),
          ],
        },
        {
          type: "mission", id: "ch2s6", conceptIds: ["c4", "c5", "c6"],
          mission: {
            kind: "match_pairs",
            instruction: "Mission: connect each term to its role.",
            pairs: [["RuBisCO", "Fixes CO2"], ["Stroma", "Site of the Calvin cycle"], ["ATP", "Energy carrier"], ["Glucose", "Final sugar product"]],
          },
        },
        {
          type: "shooter", id: "ch2s6b", title: "Invaders",
          questions: [
            q("c5", "Which molecule first accepts CO2 in the Calvin cycle?", ["RuBP", "Glucose", "ATP", "Pyruvate"], 0, "RuBisCO attaches CO2 to RuBP.", 2),
            q("c4", "How many turns of the Calvin cycle make one glucose?", ["6", "1", "3", "12"], 0, "Six CO2 are fixed for six carbons.", 2),
            q("c6", "What is the main job of the Calvin cycle?", ["Build sugar from CO2", "Split water", "Absorb light", "Release oxygen"], 0, "It uses ATP and NADPH to make sugar.", 1),
          ],
        },
        {
          type: "level_test", id: "ch2s7", passMark: 4,
          questions: [
            q("c6", "Which is the correct overall equation?", ["6CO2 + 6H2O → C6H12O6 + 6O2", "C6H12O6 + 6O2 → 6CO2 + 6H2O", "6O2 + 6H2O → C6H12O6 + 6CO2", "CO2 + O2 → H2O"], 0, "Photosynthesis builds glucose and releases oxygen.", 2),
            q("c4", "Another name for the Calvin cycle is:", ["Light-independent reactions", "Light reactions", "Glycolysis", "Krebs cycle"], 0, "It doesn't use light directly.", 1),
            q("c6", "How many CO2 molecules are fixed to make one glucose?", ["6", "2", "12", "1"], 0, "Glucose has 6 carbon atoms.", 2),
            q("c6", "Plants store extra glucose as:", ["Starch", "Keratin", "Lactose", "Cholesterol"], 0, "Starch is the plant storage carbohydrate.", 1),
            q("c3", "Which stage directly produces oxygen?", ["Light reactions", "Calvin cycle", "Glycolysis", "Fermentation"], 0, "Oxygen comes from splitting water in the light reactions.", 2),
          ],
        },
        { type: "mini_boss", id: "ch2s8", boss: { name: "Siege Titan", kind: "colossus", fight: "martial" }, pool: "chapter", count: 6 },
      ],
    },
  ],
  finalBoss: {
    title: "The Final Boss",
    goal: "Defeat the Sorcerer using everything you have learned",
    theme: { background: "ember_citadel" },
    boss: { name: "Malachar the Sorcerer", kind: "overlord", fight: "magic" },
    count: 25,
    passMarkRatio: 0.7,
    // Draws from every chapter question; extras cover whole-syllabus concepts.
    extraQuestions: [
      q("c6", "Which two raw materials do plants need for photosynthesis?", ["Water and carbon dioxide", "Oxygen and glucose", "Nitrogen and starch", "Salt and sunlight"], 0, "CO2 and water are converted into glucose and oxygen.", 1),
    ],
  },
};
