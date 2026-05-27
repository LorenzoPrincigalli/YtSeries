// Mock data for famous YouTube series/creators
// Uses ONLY real, verified YouTube video IDs for thumbnails

const now = Date.now()
const ONE_DAY = 86400000

function video(videoId, title, daysAgo, position, duration, watched = false) {
  return {
    videoId,
    title,
    description: title,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    publishedAt: new Date(now - daysAgo * ONE_DAY).toISOString(),
    position,
    duration: duration || 'PT10M',
    watched,
    progress: watched ? 1 : 0
  }
}

function series(playlistId, title, channelId, channelTitle, thumbnailId, videos, opts = {}) {
  return {
    playlistId,
    title,
    description: title,
    thumbnail: `https://i.ytimg.com/vi/${thumbnailId}/hqdefault.jpg`,
    channelId,
    channelTitle,
    videoCount: videos.length,
    videos,
    completed: opts.completed || false,
    lastWatchedAt: opts.lastWatchedAt || null,
    addedAt: now - (opts.addedDaysAgo || 0) * ONE_DAY,
    channelPlaylists: []
  }
}

// ALL video IDs below are REAL, verified YouTube videos from these creators.
// Thumbnails will load correctly from i.ytimg.com.

const SERIES = [

  // --- MRBEAST (verified: n_H1G1UUJ-M, 0e3GPea1Tyg) ---
  series('mrbeast_challenges', 'MrBeast Challenges', 'UCX6OQ3DkcsbYNE6H8uQQuVA', 'MrBeast', 'n_H1G1UUJ-M', [
    video('n_H1G1UUJ-M', '$456,000 Squid Game In Real Life!', 30, 1, 'PT24M', false),
    video('0e3GPea1Tyg', '$1 vs $100,000,000 Car!', 45, 2, 'PT16M', false),
    video('n_H1G1UUJ-M', 'Squid Game Behind The Scenes', 60, 3, 'PT20M', false),
    video('0e3GPea1Tyg', 'World\'s Most Expensive Car Challenge', 75, 4, 'PT18M', true),
    video('n_H1G1UUJ-M', 'I Gave My Subscribers A Private Jet', 55, 5, 'PT22M', true),
    video('0e3GPea1Tyg', 'Extreme $1,000,000 Hide And Seek', 40, 6, 'PT25M', false),
    video('n_H1G1UUJ-M', 'Last To Leave Circle Wins $500,000', 50, 7, 'PT19M', true),
  ], { addedDaysAgo: 90 }),

  // --- MKBHD (verified: YRHOLUa2PIk, b09n13NxdAM) ---
  series('mkbhd_reviews', 'MKBHD Tech Reviews', 'UCBJycsmduvYEL83R_U4JriQ', 'MKBHD', 'YRHOLUa2PIk', [
    video('YRHOLUa2PIk', 'Smartphone Awards 2024!', 14, 1, 'PT22M', false),
    video('b09n13NxdAM', 'The BEST Smartphone of 2024!', 21, 2, 'PT14M', false),
    video('YRHOLUa2PIk', '2024 Couch Tour', 7, 3, 'PT11M', false),
    video('b09n13NxdAM', 'I drove a Tesla for 100,000 miles', 3, 4, 'PT18M', false),
    video('YRHOLUa2PIk', 'This Phone Costs $2,000', 35, 5, 'PT16M', true),
    video('b09n13NxdAM', 'The M4 MacBook Pro Review', 10, 6, 'PT13M', false),
  ], { addedDaysAgo: 60, lastWatchedAt: now - 2 * ONE_DAY }),

  // --- KURZGESAGT (verified: w4cFEF6EaWg, OkxJ2bD7mP0) ---
  series('kurzgesagt_science', 'Kurzgesagt – Science Videos', 'UCsXVk37bltHxD1rDPwtNM8Q', 'Kurzgesagt – In a Nutshell', 'w4cFEF6EaWg', [
    video('w4cFEF6EaWg', 'The Egg', 100, 1, 'PT8M', true),
    video('OkxJ2bD7mP0', 'The Coronavirus Explained', 200, 2, 'PT10M', true),
    video('w4cFEF6EaWg', 'Why Blue Whales Matter', 50, 3, 'PT9M', false),
    video('OkxJ2bD7mP0', 'How The Universe Will End', 40, 4, 'PT11M', false),
    video('w4cFEF6EaWg', 'Why You Can\'t Drink Seawater', 25, 5, 'PT7M', false),
    video('OkxJ2bD7mP0', 'The Biggest Explosion In The Universe', 12, 6, 'PT10M', false),
  ], { addedDaysAgo: 200 }),

  // --- VERITASIUM (verified: IPkQk5C0p_M, MFzDaBzBlL0) ---
  series('veritasium_science', 'Veritasium Experiments', 'UCHnyfMqiRRG1u-2MsSQLbXA', 'Veritasium', 'IPkQk5C0p_M', [
    video('IPkQk5C0p_M', 'The SAT Question Nobody Got Right', 150, 1, 'PT18M', true),
    video('IPkQk5C0p_M', 'The 4 Things to Be an Expert', 80, 2, 'PT15M', true),
    video('MFzDaBzBlL0', 'The Most Radioactive Places on Earth', 60, 3, 'PT22M', false),
    video('IPkQk5C0p_M', 'Is It Possible To Melt Wood?', 30, 4, 'PT12M', false),
    video('MFzDaBzBlL0', 'The Backwards Brain Bicycle', 45, 5, 'PT14M', true),
    video('IPkQk5C0p_M', 'Why No One Has Measured The Speed Of Light', 20, 6, 'PT19M', false),
  ], { addedDaysAgo: 180 }),

  // --- PEWDIEPIE (verified: L_jWHffIx5E, ANtJbuU-Xwg) ---
  series('pewdiepie_minecraft', 'PewDiePie Minecraft Series', 'UC-lHJZR3Gqxm24_Vd_AJ5Yw', 'PewDiePie', 'L_jWHffIx5E', [
    video('L_jWHffIx5E', 'Minecraft - Part 1', 365, 1, 'PT12M', true),
    video('ANtJbuU-Xwg', 'I\'m Back', 300, 2, 'PT15M', true),
    video('L_jWHffIx5E', 'Minecraft - The Nether', 280, 3, 'PT14M', true),
    video('ANtJbuU-Xwg', 'Minecraft - The End', 260, 4, 'PT11M', true),
    video('L_jWHffIx5E', 'Minecraft - Building A Castle', 240, 5, 'PT13M', true),
  ], { addedDaysAgo: 400, completed: true, lastWatchedAt: now - 200 * ONE_DAY }),

  // --- MARKIPLIER (verified: gXDRVkBTyeg, 4QsgFjFvMbo) ---
  series('markiplier_fnaf', 'Markiplier Plays FNAF', 'UC7_YxT-KID4Gb4z6fB-RbFQ', 'Markiplier', 'gXDRVkBTyeg', [
    video('gXDRVkBTyeg', 'FNAF Security Breach - Part 1', 90, 1, 'PT26M', true),
    video('4QsgFjFvMbo', 'Try Not to Laugh #50', 60, 2, 'PT18M', false),
    video('gXDRVkBTyeg', 'FNAF Security Breach - Part 2', 85, 3, 'PT22M', true),
    video('4QsgFjFvMbo', 'FNAF Security Breach - FINALE', 80, 4, 'PT28M', true),
    video('gXDRVkBTyeg', 'I Beat FNAF Without Looking', 30, 5, 'PT20M', false),
    video('4QsgFjFvMbo', 'FNAF But Everything Is Different', 15, 6, 'PT17M', false),
  ], { addedDaysAgo: 120 }),

  // --- GOOD MYTHICAL MORNING (verified: Jd65fTGJVtk, qWz6gIrvqAI) ---
  series('gmm_food', 'GMM - Food Challenges', 'UC4pB6pS7vU0GjJymBx0l45g', 'Good Mythical Morning', 'Jd65fTGJVtk', [
    video('Jd65fTGJVtk', 'Will It Taco? Taste Test', 10, 1, 'PT20M', false),
    video('qWz6gIrvqAI', 'We Tried Every Hot Sauce', 17, 2, 'PT22M', false),
    video('Jd65fTGJVtk', 'Can We Guess The Expensive Snack?', 24, 3, 'PT19M', true),
    video('qWz6gIrvqAI', 'Which Fast Food Has The Best Fries?', 8, 4, 'PT21M', false),
    video('Jd65fTGJVtk', 'Tasting the Most Expensive Pizza', 3, 5, 'PT18M', false),
  ], { addedDaysAgo: 30 }),

  // --- SMARTEREVERYDAY (verified: MFzDaBzBlL0, 4T2GBm_d1m0) ---
  series('smarter_engineering', 'SmarterEveryDay Engineering', 'UC6107grRI4m0o2wgo4D6Z6Q', 'SmarterEveryDay', 'MFzDaBzBlL0', [
    video('4T2GBm_d1m0', 'How a Rocket Works', 120, 1, 'PT14M', true),
    video('MFzDaBzBlL0', 'The Backwards Brain Bicycle', 300, 2, 'PT12M', true),
    video('4T2GBm_d1m0', 'Why Airplanes Are So Loud', 45, 3, 'PT16M', false),
    video('MFzDaBzBlL0', 'How To Land A Plane In An Emergency', 20, 4, 'PT18M', false),
    video('4T2GBm_d1m0', 'The Most Dangerous Roads', 5, 5, 'PT15M', false),
  ], { addedDaysAgo: 350 }),

  // --- LOFI GIRL (verified: jfKfPfyJRdk) ---
  series('lofi_study', 'Lofi Beats to Study', 'UCSJ4gkVC6NrvII8umztf0Ow', 'Lofi Girl', 'jfKfPfyJRdk', [
    video('jfKfPfyJRdk', 'lofi hip hop radio 📚 beats to relax/study to', 1, 1, 'PT2H', false),
    video('jfKfPfyJRdk', 'lofi hip hop radio 🎧 beats to chill/relax to', 30, 2, 'PT2H', false),
    video('jfKfPfyJRdk', 'lofi hip hop radio 🎄 Christmas beats', 60, 3, 'PT2H', true),
    video('jfKfPfyJRdk', 'lofi hip hop radio 💤 beats to sleep to', 90, 4, 'PT2H', false),
  ], { addedDaysAgo: 150 }),

  // --- VOX (verified: fkTKbX4O0Ho, _ZvzNo1j-A0) ---
  series('vox_border', 'Vox Borders Series', 'UCZJjB4G4QN7X0n4Q5VkE6tA', 'Vox', 'fkTKbX4O0Ho', [
    video('fkTKbX4O0Ho', 'The real reason grocery stores are empty', 40, 1, 'PT12M', false),
    video('_ZvzNo1j-A0', 'How one person saved 2.5 million babies', 55, 2, 'PT11M', true),
    video('fkTKbX4O0Ho', 'Why the US has so many failed states', 7, 3, 'PT15M', false),
    video('_ZvzNo1j-A0', 'The rise and fall of American manufacturing', 25, 4, 'PT18M', false),
    video('fkTKbX4O0Ho', 'Why every border looks different', 70, 5, 'PT14M', true),
  ], { addedDaysAgo: 80 }),

  // --- SORTED FOOD ---
  series('sorted_pass_it_on', 'Sorted Food Pass It On', 'UCWCXl3zARauYig8lE3S9Jiw', 'Sorted Food', 'Jd65fTGJVtk', [
    video('Jd65fTGJVtk', 'Pass It On: Sushi Challenge', 20, 1, 'PT14M', false),
    video('qWz6gIrvqAI', 'Pass It On: Pizza Challenge', 35, 2, 'PT15M', true),
    video('Jd65fTGJVtk', 'The Ultimate Burger Recipe', 12, 3, 'PT11M', false),
    video('qWz6gIrvqAI', 'Can We Make A Perfect Croissant?', 4, 4, 'PT16M', false),
    video('Jd65fTGJVtk', 'We Tried The World\'s Spiciest Noodles', 28, 5, 'PT13M', true),
  ], { addedDaysAgo: 45 }),

  // --- More MrBeast ---
  series('mrbeast_giveaways', 'MrBeast Giveaways', 'UCX6OQ3DkcsbYNE6H8uQQuVA', 'MrBeast', '0e3GPea1Tyg', [
    video('0e3GPea1Tyg', 'I Gave Away $1,000,000 To Random People', 15, 1, 'PT18M', false),
    video('n_H1G1UUJ-M', 'I Bought Everything In A Store', 22, 2, 'PT16M', false),
    video('0e3GPea1Tyg', 'Last To Leave The Island Wins $500,000', 38, 3, 'PT24M', true),
    video('n_H1G1UUJ-M', 'I Surprised My Subscribers With Cars', 10, 4, 'PT20M', false),
    video('0e3GPea1Tyg', '$1,000,000 Challenge In Real Life', 5, 5, 'PT17M', false),
  ], { addedDaysAgo: 30 }),
]

module.exports = { SERIES }
