// protocol.js
// Edit this file anytime you change products. 
// "AM" is your morning routine. "PM_A" are your Retrieve nights. "PM_B" are Rest/Alt nights.

const PROTOCOL = {
    // PHASE 1: Right Now
    1: {
        name: "Phase 1 (Right Now)",
        AM: ["Neutrogena Ultra Gentle Cleanser", "The Ordinary Hyaluronic Acid", "The Ordinary Niacinamide", "CeraVe Moisturiser", "Current sunscreen"],
        PM_A: ["Cetaphil / Neutrogena", "Wait 20-30 mins", "Retrieve cream", "CeraVe Moisturiser"], // Mon, Wed, Fri
        PM_B: ["Neutrogena Foaming Cleanser", "The Ordinary HA + Niacinamide", "CeraVe Moisturiser"], // Tue, Thu, Sat, Sun
        Modifiers: { "Wednesday": "🔴 Add Red Light Therapy", "Saturday": "🔴 Add Red Light Therapy" }
    },
    // PHASE 2: Cycle 1
    2: {
        name: "Phase 2 (Cycle 1)",
        AM: ["Neutrogena Ultra Gentle Cleanser", "Inkey List Caffeine Eye Cream", "SKIN1004 Brightening Ampoule", "COSRX 6 Peptide Serum", "TO Niacinamide", "CeraVe Moisturiser", "Beauty of Joseon SPF 50+"],
        PM_A: ["Kose Oil Cleanser", "Neutrogena Ultra Gentle Foaming Cleanser", "Wait 20-30 mins", "Retrieve cream", "CeraVe Moisturiser"], 
        PM_B: ["Neutrogena Foaming Cleanser", "SKIN1004 Brightening Ampoule", "COSRX Peptide Serum", "TO Niacinamide", "CeraVe Moisturiser"],
        Modifiers: { "Wednesday": "🔴 Add Red Light Therapy", "Saturday": "🔴 Add Red Light Therapy" }
    },
    // PHASE 3: Cycle 2
    3: {
        name: "Phase 3 (Cycle 2)",
        AM: ["Neutrogena Ultra Gentle Cleanser", "Inkey List Caffeine Eye Cream", "SKIN1004 Brightening Ampoule", "COSRX 6 Peptide Serum", "Beauty of Joseon Glow Serum", "Medi-Peel Peptide 9 Tox Cream", "Beauty of Joseon SPF 50+"],
        PM_A: ["Kose Oil Cleanse", "Neutrogena Cleanser", "Wait 20 mins", "Retrieve cream", "Medi-Peel Tox Cream"], // Mon, Wed, Fri
        PM_B_TueThu: ["Neutrogena Cleanser", "COSRX BHA Blackhead Liquid", "SKIN1004 Ampoule (Thu only)", "COSRX Peptide Serum", "Medi-Peel Tox Cream"],
        PM_B_Sat: ["Neutrogena Cleanser", "BoJ Glow Serum", "Medi-Peel Tox Cream"],
        PM_B_Sun: ["Neutrogena Cleanser", "COSRX Peptide Serum", "Medi-Peel Tox Cream"],
        Modifiers: { "Wednesday": "🔴 Add Red Light Therapy", "Saturday": "🔴 Add Red Light Therapy" }
    },
    // PHASE 4: Full Protocol
    4: {
        name: "Phase 4 (Full Protocol)",
        AM: ["Neutrogena Ultra Gentle Cleanser", "Inkey List Caffeine Eye Cream", "SKIN1004 Brightening Ampoule", "COSRX 6 Peptide Serum", "Beauty of Joseon Glow Serum", "Medi-Peel Peptide 9 Tox Cream", "Beauty of Joseon SPF 50+"],
        PM_A: ["Kose Oil Cleanse", "Neutrogena", "Wait 20 mins", "Retrieve", "Medi-Peel Tox Cream", "COSRX Snail Eye Cream"],
        PM_B_TueThu: ["Neutrogena", "COSRX BHA", "SKIN1004 Ampoule (Thu only)", "COSRX Peptide Serum", "Medi-Peel Tox Cream", "Snail Eye Cream (Tue only)"],
        PM_B_Sat: ["Kose Oil Cleanse", "Neutrogena", "Innisfree Clay Mask (10 min, rinse)", "Ma:nyo Enzyme Peel (optional)", "BoJ Glow Serum", "Medi-Peel Tox Cream"],
        PM_B_Sun: ["Neutrogena", "COSRX Peptide Serum", "Medi-Peel Tox Cream"],
        Modifiers: { "Wednesday": "🔴 Add Red Light Therapy", "Saturday": "🔴 Add Red Light Therapy" }
    }
};