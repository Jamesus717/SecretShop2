// Generated from the BortyBrain note "Lazy League" (website copy). Edit there, then regenerate.
import type { RuleSection } from '../Rules/content';

export const LAZY_LEAGUE_SECTIONS: RuleSection[] = [
 {
  "id": "about-lazy-league",
  "title": "About Lazy League",
  "paras": [],
  "blocks": [
   {
    "p": [
     "Lazy League is the next SecretLeague Dota 2 tournament. The games are real Dota 2 series, played in lobbies our bot hosts. Around them sits a fan economy: fans pick a team, earn gold when it wins, and spend it on bets, auction votes, shields, curses and weather. The bot adds a little chaos. You can die, but only if you opt in."
    ]
   },
   {
    "p": [
     {
      "b": "Status: coming soon."
     },
     " Start date, sign-ups and prizes will be announced in the Discord."
    ]
   }
  ]
 },
 {
  "id": "at-a-glance",
  "title": "At a glance",
  "paras": [],
  "blocks": [
   {
    "table": [
     [
      [
       "Game"
      ],
      [
       "Dota 2"
      ]
     ],
     [
      [
       "Run by"
      ],
      [
       "SecretLeague"
      ]
     ],
     [
      [
       "Start date"
      ],
      [
       "To be announced"
      ]
     ],
     [
      [
       "Sign-ups"
      ],
      [
       "To be announced"
      ]
     ],
     [
      [
       "Format"
      ],
      [
       "Real Dota 2 series on a bot-hosted lobby, with a fan economy on top"
      ]
     ],
     [
      [
       "Prize"
      ],
      [
       "To be announced"
      ]
     ],
     [
      [
       "Where"
      ],
      [
       "Discord: ",
       {
        "a": "https://discord.gg/FvPF55KkYY",
        "t": "discord.gg/FvPF55KkYY"
       }
      ]
     ]
    ]
   }
  ]
 },
 {
  "id": "what-is-real-and-what-is-discord",
  "title": "What is real and what is Discord",
  "paras": [],
  "blocks": [
   {
    "p": [
     "The Dota is real. The league around it is a game of its own."
    ]
   },
   {
    "table": [
     [
      [
       "Matches"
      ],
      [
       "Real Dota 2 series, up to seven games"
      ],
      [
       "The bot opens the lobby 15 minutes before the start"
      ]
     ],
     [
      [
       "Side and pick order"
      ],
      [
       "The bot rolls in lobby chat, no coin toss"
      ],
      [
       "The winner picks side or pick order, the other team gets the other"
      ]
     ],
     [
      [
       "Draft penalties"
      ],
      [
       "Admin sanctions on a team"
      ],
      [
       "30-90 seconds less draft reserve time in a game, or losing its next first choice"
      ]
     ],
     [
      [
       "Rosters"
      ],
      [
       "Real players, five per team at most"
      ],
      [
       "Standins come from the free agent channel"
      ]
     ],
     [
      [
       "Draft twists"
      ],
      [
       "Weather can change the lobby"
      ],
      [
       "Reverse Captains Mode or Immortal Draft"
      ]
     ],
     [
      [
       "In-game bonuses"
      ],
      [
       "Gold for what happens in the game"
      ],
      [
       "50 gold each for a Rampage, Ultra kill, win without dying and top hero damage"
      ]
     ],
     [
      [
       "Fan economy"
      ],
      [
       "Discord only"
      ],
      [
       "Betting, auction votes, pledges, weather changes, the Election"
      ]
     ],
     [
      [
       "Death and revives"
      ],
      [
       "A league mechanic, not a Dota one"
      ],
      [
       "Opted-in players can die for the season, and fans can pay to revive them"
      ]
     ]
    ],
    "head": [
     "Layer",
     "What it is",
     "Dota detail"
    ]
   },
   {
    "p": [
     "The fan layer never changes what happens inside a game. It changes the league around it and, in a few weather cases, the draft format."
    ]
   }
  ]
 },
 {
  "id": "how-a-match-day-works",
  "title": "How a match day works",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      "The admins set each series' time."
     ],
     [
      "Everyone in the lineup gets a DM asking if they can play. Captains find standins for anyone who can't."
     ],
     [
      "The lobby opens by itself 15 minutes before the series."
     ],
     [
      {
       "b": "No coin toss."
      },
      " In games 1, 3, 5 and 7 the bot rolls in lobby chat once both teams are in. The winner chooses first: the side or the pick order. The other team gets the other choice."
     ],
     [
      "In games 2, 4 and 6, the loser of the previous roll chooses first."
     ],
     [
      "Admins can penalise a team by cutting 30-90 seconds of draft reserve time in a game, or by taking away its next first choice."
     ],
     [
      "Every series gets weather on its game day (see Weather)."
     ]
    ]
   }
  ]
 },
 {
  "id": "fans-and-gold",
  "title": "Fans and gold",
  "paras": [],
  "blocks": [
   {
    "p": [
     "Teams have no gold of their own. Fans pay for everything, from their own wallets."
    ]
   },
   {
    "ul": [
     [
      "Pick a team in the fan-selection channel. ",
      {
       "b": "Your first pick locks you in until the season ends."
      },
      " Players are always fans of their own team."
     ],
     [
      "You then get a team HQ that only your team's fans can see. A \"What needs me?\" button lists everything waiting on you. It is all buttons, so there is nothing to type."
     ],
     [
      "The rest lives in league-hq: Fans, Me and What's on."
     ]
    ]
   },
   {
    "h3": "Earning gold"
   },
   {
    "table": [
     [
      [
       "Win pot"
      ],
      [
       "2,000 gold per series your team wins, split between active fans and the players who played. Fewer fans means bigger shares."
      ]
     ],
     [
      [
       "Stipend"
      ],
      [
       "250 gold per season, the first time you show up"
      ]
     ],
     [
      [
       "Begging"
      ],
      [
       "50 gold, once every 24 hours"
      ]
     ],
     [
      [
       "Stay active"
      ],
      [
       "Do something every 7 days (cheer, beg, bet, pledge or vote) to share the pots"
      ]
     ]
    ],
    "head": [
     "Way",
     "Amount"
    ]
   },
   {
    "p": [
     {
      "b": "Spending gold"
     },
     " (from your team HQ)"
    ]
   },
   {
    "ul": [
     [
      "Bet on any series before it starts."
     ],
     [
      "Pledge to shield your players, curse a rival or revive the dead."
     ],
     [
      "Change the weather."
     ],
     [
      "Vote in the auction."
     ],
     [
      "Vote in the Election."
     ]
    ]
   }
  ]
 },
 {
  "id": "the-auction",
  "title": "The auction",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      "Every team gets the same budget, measured in player rating."
     ],
     [
      "While an auction is on, fans vote for the players they want. ",
      {
       "b": "n votes on one player cost n squared times 10 gold"
      },
      ", spent for good."
     ],
     [
      "When a player comes up, the bot bids for each team based on how many votes that player got. Nobody bids by hand."
     ],
     [
      "Teams still short afterwards get the leftover players free, emptiest team first."
     ]
    ]
   }
  ]
 },
 {
  "id": "signings-and-transfers",
  "title": "Signings and transfers",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      {
       "b": "Free agents:"
      },
      " during a transfer window, any fan can propose a signing, with an optional bonus from their own wallet. The team's fans vote for up to 24 hours. More than half of the active fans saying yes passes it at once. Then the player accepts or declines."
     ],
     [
      {
       "b": "Trades:"
      },
      " rosters only change in a transfer window, which the admins open. Captains propose trades of up to two players each way, the other captain accepts and the admins approve."
     ],
     [
      {
       "b": "Tax:"
      },
      " 5% of every signing bonus is taxed away."
     ],
     [
      {
       "b": "Limits:"
      },
      " no trades within 6 hours of a team's series, and a team has at most 5 players."
     ]
    ]
   }
  ]
 },
 {
  "id": "betting",
  "title": "Betting",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      "Bet on any series once it has both teams and a time, until it starts."
     ],
     [
      "It is ",
      {
       "b": "pool betting"
      },
      ". The winning side shares everything bet on the series, in proportion to each bet. The bot adds nothing."
     ],
     [
      "One bet per series. You can add to it but not switch sides. Players can only back their own side."
     ],
     [
      "Draws, forfeits, cancelled series and Fog weather give everyone their stake back."
     ],
     [
      "Bets show who the bot thinks will win, based on each lineup's ratings (standins included). It is only a guide. The pool decides what a bet pays."
     ]
    ]
   }
  ]
 },
 {
  "id": "player-bonuses",
  "title": "Player bonuses",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      {
       "b": "Big plays:"
      },
      " 50 gold each for a Rampage, an Ultra kill, a win without dying and the game's top hero damage."
     ],
     [
      {
       "b": "MVP:"
      },
      " after each series the fans vote in league-feed for 24 hours. The winner gets 250 gold."
     ],
     [
      {
       "b": "Challenges:"
      },
      " a claimed challenge's bounty goes to the players in the match."
     ],
     [
      "Players also share the win pot of every series they play and win."
     ]
    ]
   }
  ]
 },
 {
  "id": "death-and-opting-in",
  "title": "Death and opting in",
  "paras": [],
  "blocks": [
   {
    "p": [
     "By opting in you agree that you may die. The League accepts no responsibility for:"
    ]
   },
   {
    "ul": [
     [
      {
       "b": "Feeding:"
      },
      " lose a series with the most deaths on your team and the void may collect."
     ],
     [
      {
       "b": "Incineration:"
      },
      " on game days, fate sometimes picks a random opted-in player and sets them on fire."
     ],
     [
      {
       "b": "Curses:"
      },
      " rival fans can club together to curse you."
     ],
     [
      {
       "b": "Smiting:"
      },
      " admins can smite you, shield or no shield. Be nice to admins."
     ],
     [
      {
       "b": "Purges:"
      },
      " the Election can decree one."
     ]
    ]
   },
   {
    "p": [
     "Only players who opt in can die. Opt in under Players in league-hq, or leave the box ticked when you register. You can back out until the season's first result. After that you are in until it ends."
    ]
   },
   {
    "table": [
     [
      [
       "Feeding"
      ],
      [
       "2% chance per series loss, for the losing player who died most"
      ]
     ],
     [
      [
       "Incineration"
      ],
      [
       "10% chance each game day that one random opted-in player dies"
      ]
     ],
     [
      [
       "Curses"
      ],
      [
       "Rival fans pool 1,000 gold. It strikes at your next series 25% of the time"
      ]
     ],
     [
      [
       "Limits"
      ],
      [
       "At most 1 death a day across the league, and 2 per team a season"
      ]
     ],
     [
      [
       "New players"
      ],
      [
       "Safe from death for their first 3 series"
      ]
     ]
    ],
    "head": [
     "Cause",
     "Odds"
    ]
   },
   {
    "h3": "Coming back"
   },
   {
    "ul": [
     [
      {
       "b": "Shield:"
      },
      " your fans pool 1,000 gold to block your next death. It does not stop a smite."
     ],
     [
      {
       "b": "Revive:"
      },
      " your fans pool 5,000 gold to bring you back."
     ],
     [
      {
       "b": "Necromancy:"
      },
      " a 3% chance each game day that a random dead player comes back, onto a team with room."
     ],
     [
      "Death lasts the rest of the season. Next season everyone is alive again, as a free agent."
     ],
     [
      "The dead are listed in the Hall of Flame, under League, League info in league-hq."
     ]
    ]
   }
  ]
 },
 {
  "id": "fans-becoming-players",
  "title": "Fans becoming players",
  "paras": [],
  "blocks": [
   {
    "p": [
     "Register in league-hq (Players, Register as a player). Once the season's auction is over, press Volunteer to ascend. There are three ways up:"
    ]
   },
   {
    "ol": [
     [
      {
       "b": "Fans' vote:"
      },
      " when a death leaves a team short, its fans vote for one of its volunteers in the team's fan chat. It closes 2 hours before the team's next series, or after 48 hours."
     ],
     [
      {
       "b": "Buy it:"
      },
      " 2,000 gold with Buy ascension in your team HQ, if the team has room."
     ],
     [
      {
       "b": "The call-up:"
      },
      " a 5% chance each game day that a random volunteer is called up onto their team."
     ]
    ]
   },
   {
    "p": [
     "New players are safe from death for their first 3 series."
    ]
   }
  ]
 },
 {
  "id": "standins",
  "title": "Standins",
  "paras": [],
  "blocks": [
   {
    "p": [
     "When a player can't make it, their captain asks for a standin and can offer a bounty from their own wallet. The request goes up in the free agent channel with an \"I'm available\" button, and the captain picks from whoever pressed it. The bounty is paid once the standin is seen in the match."
    ]
   }
  ]
 },
 {
  "id": "weather",
  "title": "Weather",
  "paras": [],
  "blocks": [
   {
    "p": [
     "Every series gets weather, rolled at random 6 hours before its game day starts and posted in league-feed. It never changes the Dota game itself, only the league's gold and the lobby the bot hosts."
    ]
   },
   {
    "table": [
     [
      [
       "Clear skies"
      ],
      [
       "35%"
      ],
      [
       "Nothing happens. Enjoy it while it lasts"
      ]
     ],
     [
      [
       "Golden hour"
      ],
      [
       "13%"
      ],
      [
       "The win pot is doubled"
      ]
     ],
     [
      [
       "Fog"
      ],
      [
       "13%"
      ],
      [
       "All bets are refunded, and none can be placed"
      ]
     ],
     [
      [
       "Underdog wind"
      ],
      [
       "13%"
      ],
      [
       "If the underdog wins, the win pot is tripled"
      ]
     ],
     [
      [
       "Tax storm"
      ],
      [
       "13%"
      ],
      [
       "Every fan of the losing team loses 5% of their gold"
      ]
     ],
     [
      [
       "Feedback"
      ],
      [
       "4%"
      ],
      [
       "A player from each side plays for the other. Admins may make it last the season"
      ]
     ],
     [
      [
       "Reverb"
      ],
      [
       "4%"
      ],
      [
       "The lobby is Reverse Captains Mode: each team picks for the other"
      ]
     ],
     [
      [
       "Immortal rain"
      ],
      [
       "4%"
      ],
      [
       "Immortal Draft: only the two captains take slots, and they draft everyone else in the lobby"
      ]
     ]
    ],
    "head": [
     "Weather",
     "Chance",
     "Effect"
    ]
   },
   {
    "p": [
     {
      "b": "Changing the weather:"
     },
     " once one of your team's series is forecast, your HQ gets a Change the weather button until the series starts. Your side's fans pool ",
     {
      "b": "1,000 gold to reroll"
     },
     " it at random, or ",
     {
      "b": "3,000 gold to choose"
     },
     " it. It changes the moment it is funded. Each side gets one change per series. A fund still short when the series starts is handed back."
    ]
   }
  ]
 },
 {
  "id": "the-election",
  "title": "The Election",
  "paras": [],
  "blocks": [
   {
    "p": [
     "Late in the season, before the last stage, the admins open the Election. It runs about 72 hours. While it is open, your team HQ gets an Election: vote button."
    ]
   },
   {
    "p": [
     {
      "b": "n votes on one option cost n squared times 1 gold"
     },
     ", so each extra vote costs more and spreading out is cheaper than piling on. The gold is gone either way."
    ]
   },
   {
    "h3": "Decrees, for everyone (the most-voted one passes)"
   },
   {
    "table": [
     [
      [
       "Second wind"
      ],
      [
       "Everyone who died this season starts next season with a shield"
      ]
     ],
     [
      [
       "Purge"
      ],
      [
       "A random opted-in player on every team is incinerated"
      ]
     ],
     [
      [
       "Big money"
      ],
      [
       "Win pots are doubled all next season"
      ]
     ],
     [
      [
       "Lockdown"
      ],
      [
       "No Feedback weather next season"
      ]
     ],
     [
      [
       "Open borders"
      ],
      [
       "An extra transfer window opens mid-season"
      ]
     ],
     [
      [
       "Expansion"
      ],
      [
       "A new team is founded, filled by ascension votes"
      ]
     ],
     [
      [
       "Merciless"
      ],
      [
       "Death chances are doubled all next season"
      ]
     ],
     [
      [
       "Reshuffle"
      ],
      [
       "Every team's bench is redrafted"
      ]
     ]
    ],
    "head": [
     "Decree",
     "Effect"
    ]
   },
   {
    "p": [
     {
      "b": "Blessings, one team each"
     },
     " (drawn between the teams whose fans voted for it, weighted by their votes)"
    ]
   },
   {
    "table": [
     [
      [
       "Revival"
      ],
      [
       "Your team's most recent dead player comes back right away"
      ]
     ],
     [
      [
       "Fortification"
      ],
      [
       "Two of your players get a shield against their next death"
      ]
     ],
     [
      [
       "Bonus pot"
      ],
      [
       "Your team's win pots are 1.5 times all next season"
      ]
     ],
     [
      [
       "Draft pick"
      ],
      [
       "First pick of the free agents next season"
      ]
     ],
     [
      [
       "Steal"
      ],
      [
       "Take a random player from a rival team (one who opted in to the season)"
      ]
     ],
     [
      [
       "Ascension"
      ],
      [
       "One of your standing fans ascends to the roster"
      ]
     ],
     [
      [
       "Hardened"
      ],
      [
       "A random player of yours can't die all next season"
      ]
     ],
     [
      [
       "Shared fortune"
      ],
      [
       "Every fan of your team gets 250 gold"
      ]
     ]
    ],
    "head": [
     "Blessing",
     "Effect"
    ]
   },
   {
    "p": [
     "Season-long results last the whole next season. They are listed under League, League info, Election effects in league-hq."
    ]
   }
  ]
 },
 {
  "id": "quick-answers",
  "title": "Quick answers",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      {
       "b": "Do I have to play?"
      },
      " No. Fans can join in without playing. Players are fans of their own team."
     ],
     [
      {
       "b": "Can I change team?"
      },
      " No. Your first pick locks you in until the season ends."
     ],
     [
      {
       "b": "Can I die as a fan?"
      },
      " No. Only opted-in players can die."
     ],
     [
      {
       "b": "Can I back out of dying?"
      },
      " Yes, until the season's first result."
     ],
     [
      {
       "b": "Does the bot change the Dota game?"
      },
      " No. It only changes the league's gold, the lobby and, with some weather, the draft format."
     ],
     [
      {
       "b": "How do I get started?"
      },
      " Join the Discord and pick a team in fan-selection."
     ]
    ]
   }
  ]
 },
 {
  "id": "join-in",
  "title": "Join in",
  "paras": [],
  "blocks": [
   {
    "ul": [
     [
      {
       "b": "Discord:"
      },
      " ",
      {
       "a": "https://discord.gg/FvPF55KkYY",
       "t": "discord.gg/FvPF55KkYY"
      }
     ],
     [
      {
       "b": "Contact:"
      },
      " secretleaguedota@gmail.com"
     ],
     [
      {
       "b": "Support the league:"
      },
      " ",
      {
       "a": "https://ko-fi.com/secretleague",
       "t": "ko-fi.com/secretleague"
      }
     ]
    ]
   }
  ]
 }
];
