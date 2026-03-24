// protocol.js
// Default baseline protocol. The app will copy this to your browser's local storage so you can edit it in the app later.

const DEFAULT_PROTOCOL = {
    1: {
        name: "Phase 1 (Right Now)",
        AM: [
            { name: "Neutrogena Ultra Gentle Cleanser" },
            { name: "The Ordinary Hyaluronic Acid", desc: "Apply to damp skin" },
            { name: "The Ordinary Niacinamide" },
            { name: "CeraVe Moisturiser" },
            { name: "Current sunscreen", desc: "Apply 1/4 tsp to face and neck" }
        ],
        PM_A: [
            { name: "Cetaphil / Neutrogena" },
            { name: "Dry Skin Wait Time", desc: "Essential: Let skin dry completely to prevent tretinoin irritation.", timer: 1200 },
            { name: "Retrieve cream", desc: "Pea-sized amount" },
            { name: "CeraVe Moisturiser" }
        ],
        PM_B: [
            { name: "Neutrogena Foaming Cleanser" },
            { name: "The Ordinary HA + Niacinamide" },
            { name: "CeraVe Moisturiser" }
        ],
        Modifiers: { 
            "Wednesday": { name: "🔴 Red Light Therapy", timer: 600 }, 
            "Saturday": { name: "🔴 Red Light Therapy", timer: 600 } 
        }
    },
    // Adding Phase 4 as an example of advanced steps
    4: {
        name: "Phase 4 (Full Protocol)",
        AM: [
            { name: "Neutrogena Cleanser" },
            { name: "Inkey List Caffeine Eye Cream", desc: "Apply first on clean skin" },
            { name: "SKIN1004 Brightening Ampoule" },
            { name: "COSRX 6 Peptide Serum" },
            { name: "Beauty of Joseon Glow Serum" },
            { name: "Medi-Peel Tox Cream" },
            { name: "Beauty of Joseon SPF 50+" }
        ],
        PM_A: [
            { name: "Kose Oil Cleanse", desc: "Massage 60s dry, emulsify with water", timer: 60 },
            { name: "Neutrogena Cleanser" },
            { name: "Dry Skin Wait Time", timer: 1200 },
            { name: "Retrieve Cream" },
            { name: "Medi-Peel Tox Cream" },
            { name: "COSRX Snail Eye Cream" }
        ],
        PM_B_Sat: [
            { name: "Kose Oil Cleanse" },
            { name: "Neutrogena Cleanser" },
            { name: "Innisfree Clay Mask", desc: "Rinse before fully dry", timer: 600 },
            { name: "Ma:nyo Enzyme Peel (optional)" },
            { name: "BoJ Glow Serum" },
            { name: "Medi-Peel Tox Cream" }
        ],
        Modifiers: { 
            "Wednesday": { name: "🔴 Red Light Therapy", timer: 600 }, 
            "Saturday": { name: "🔴 Red Light Therapy", timer: 600 } 
        }
    }
};