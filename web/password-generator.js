export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?~',
};

export const LIMITS = {
  random: { min: 8, max: 100, default: 16 },
  memorable: { min: 3, max: 15, default: 4 },
  pin: { min: 3, max: 12, default: 6 },
};

export const SEPARATORS = ['-', ' ', '.', '_'];
export const HISTORY_LIMIT = 50;
const HISTORY_ENDPOINT = '/api/password-history';
const SVG_NS = 'http://www.w3.org/2000/svg';

// 本地内置常见易拼写英文词表（纯离线，不发起任何网络请求）
export const WORDLIST = [
  'acorn','actor','adapt','adobe','adopt','after','agate','agent','agile','agree',
  'ahead','aisle','alarm','album','alder','alert','alias','align','alike','alive',
  'alley','allow','alloy','aloft','alone','along','aloud','alpha','altar','alter',
  'amber','amble','amend','amity','among','ample','amuse','angel','angle','ankle',
  'anvil','apart','apple','apply','apron','arbor','arena','argue','arise','armor',
  'aroma','array','arrow','aspen','asset','atlas','atoll','attic','audio','audit',
  'avail','avert','avoid','await','awake','award','aware','azure','bacon','badge',
  'bagel','baker','balmy','banjo','barge','baron','basic','basil','basin','basis',
  'batch','baton','bayou','beach','beard','beech','begin','being','belle','below',
  'bench','beret','berry','berth','bevel','bezel','bingo','biome','birch','birth',
  'bison','black','blade','blame','bland','blank','blast','blaze','bleak','blend',
  'bless','blimp','blink','bliss','blitz','block','bloom','bluff','blunt','blush',
  'board','boast','bongo','bonus','boost','booth','bound','boxer','brace','braid',
  'brain','brake','brand','brass','brave','bravo','bread','break','briar','brick',
  'bride','brief','brine','bring','brink','brisk','broad','broil','brood','brook',
  'broom','broth','brown','brush','buddy','bugle','build','built','bulge','bunch',
  'bunny','burly','burst','buyer','cabin','cable','cacao','cache','cacti','caddy',
  'cadet','cairn','camel','cameo','canal','candy','canoe','canon','caper','carat',
  'cargo','carol','carry','carve','catch','cater','cause','cease','cedar','cello',
  'chain','chair','chalk','champ','chant','chard','charm','chart','chase','cheap',
  'check','cheek','cheer','chess','chest','chick','chief','child','chili','chill',
  'chime','chirp','choir','chord','chore','chuck','chunk','churn','cider','cinch',
  'civic','civil','claim','clamp','clang','clash','clasp','class','clean','clear',
  'cleat','cleft','clerk','click','cliff','climb','cling','cloak','clock','clone',
  'close','cloth','cloud','clout','clove','clown','clump','coach','coast','cobra',
  'cocoa','color','comet','comfy','comic','comma','coral','couch','could','count',
  'court','cover','craft','crane','crank','crash','crate','crave','crawl','creak',
  'cream','credo','creek','creep','crest','crisp','crook','cross','crowd','crown',
  'crumb','crush','crust','crypt','cubic','cumin','curio','curly','curry','curve',
  'cyber','cycle','daily','dairy','daisy','dance','dandy','datum','dealt','debit',
  'debug','debut','decal','decor','decoy','defer','deity','delay','delta','delve',
  'denim','dense','depot','depth','derby','deter','digit','diner','dingo','diode',
  'disco','ditch','ditto','diver','dodge','dogma','doing','donor','donut','doubt',
  'dough','dowel','downy','dozen','draft','drain','drake','drama','drape','drawl',
  'drawn','dream','dress','drift','drill','drink','drive','droll','drone','droop',
  'drown','druid','dryer','dully','dusky','dusty','duvet','dwell','eager','eagle',
  'early','earth','easel','ebony','edict','edify','egret','eight','eject','elate',
  'elbow','elder','elect','elegy','elfin','elite','elude','email','embed','ember',
  'empty','enact','endow','enjoy','ensue','enter','entry','envoy','epoch','epoxy',
  'equal','equip','erase','erect','essay','ester','ether','ethic','ethos','etude',
  'evade','event','every','evoke','exact','exalt','excel','exert','exist','extol',
  'extra','exult','fable','facet','faint','fairy','faith','fancy','fauna','favor',
  'feast','feign','femur','fence','ferry','fetch','fewer','fiber','ficus','field',
  'fiery','fifth','fifty','fight','filet','final','finch','finer','first','fixer',
  'fizzy','fjord','flail','flair','flake','flame','flank','flare','flash','flask',
  'fleck','fleet','flick','flier','fling','flint','float','flock','flood','floor',
  'flora','floss','flour','flown','fluff','fluid','fluke','flume','flush','flute',
  'flyer','foamy','focal','focus','foggy','folio','foray','force','forge','forte',
  'forth','forty','forum','found','foyer','frail','frame','frank','freed','fresh',
  'friar','frill','frisk','frock','frond','front','frost','froth','froze','fruit',
  'fudge','fugue','fully','fungi','funny','furry','fuzzy','gamer','gamma','gamut',
  'gauge','gauze','gavel','gazer','gecko','geese','genie','genre','ghost','giant',
  'giddy','girth','given','giver','glade','glare','glass','glaze','gleam','glean',
  'glide','glint','globe','glory','gloss','glove','glyph','gnome','going','golem',
  'goose','gorge','gourd','grace','grade','graft','grail','grain','grand','grant',
  'grape','graph','grasp','grass','grate','gravy','graze','great','green','greet',
  'grill','grind','groom','group','grout','grove','growl','grown','guard','guava',
  'guess','guest','guide','guild','guise','gulch','gully','gumbo','guppy','gusto',
  'gusty','habit','halve','handy','happy','hardy','haste','hasty','hatch','haven',
  'hazel','heady','heard','heart','heath','heave','heavy','hedge','hefty','helix',
  'hello','hence','heron','hilly','hinge','hippo','hitch','hoard','hobby','hoist',
  'holly','honey','honor','horse','hotel','hound','house','hover','howdy','human',
  'humid','humor','humus','hunch','hurry','husky','hutch','hydro','hyper','icing',
  'ideal','idiom','idyll','igloo','image','imbue','impel','imply','inbox','index',
  'inert','infer','ingot','inlay','inlet','inner','input','inter','intro','ionic',
  'islet','issue','ivory','jaunt','jazzy','jelly','jetty','jewel','jiffy','joint',
  'joist','joker','jolly','joust','judge','juice','juicy','jumbo','jumpy','juror',
  'kappa','karma','kayak','kebab','khaki','kiosk','kitty','knack','knead','kneel',
  'knelt','knock','knoll','known','koala','krill','label','labor','laden','ladle',
  'lance','lapel','lapse','large','lasso','latch','later','lathe','latte','laugh',
  'layer','leafy','leant','leapt','learn','lease','leash','least','leave','ledge',
  'legal','lemon','lemur','level','lever','light','liken','lilac','limbo','limit',
  'linen','liner','lingo','lithe','llama','loamy','lobby','local','locus','lodge',
  'lofty','logic','login','loose','lorry','lotus','lower','loyal','lucid','lucky',
  'lumen','lunar','lunch','lunge','lyric','macaw','macro','magic','magma','maize',
  'major','maker','mambo','mango','manor','maple','march','marry','marsh','mason',
  'match','mauve','maxim','maybe','mayor','meant','medal','media','medic','melon',
  'mercy','merge','merit','merry','metal','meter','metro','micro','midst','might',
  'milky','mimic','mince','miner','minor','minty','minus','mirth','mocha','modal',
  'model','modem','mogul','moist','molar','money','month','moose','moral','morph',
  'mossy','motel','motif','motor','motto','mound','mount','mouse','mouth','mover',
  'movie','mower','mulch','munch','mural','music','nadir','naive','naval','nerve',
  'never','newer','newly','nicer','niche','night','ninja','ninth','noble','nobly',
  'noise','noisy','nomad','north','notch','novel','nudge','nurse','nylon','oaken',
  'occur','ocean','octal','octet','offer','often','olden','older','olive','ombre',
  'omega','onion','onset','opera','optic','orbit','order','organ','other','otter',
  'ought','ounce','outdo','outer','outgo','overt','owing','owner','oxide','ozone',
  'paint','paler','panel','pansy','paper','parka','parry','parse','party','pasta',
  'paste','patch','patio','pause','peace','peach','pearl','pecan','pedal','pence',
  'penne','penny','perch','perky','pesto','petal','phase','phone','photo','piano',
  'piece','piety','pilot','pinch','piney','pinto','piper','pique','pitch','pithy',
  'pivot','pixel','pixie','pizza','place','plaid','plain','plait','plane','plank',
  'plant','plate','plaza','plead','pleat','plier','pluck','plumb','plume','plump',
  'plunk','plush','point','poise','poker','polar','polka','poppy','porch','posit',
  'pouch','pound','power','prank','prawn','preen','press','price','pride','prime',
  'print','prior','prism','prize','probe','prone','prong','proof','prose','proud',
  'prove','prowl','proxy','prune','pulse','punch','pupil','puppy','puree','purer',
  'purse','putty','quack','quail','quake','qualm','quark','quart','quash','quasi',
  'queen','quell','query','quest','queue','quick','quiet','quill','quilt','quirk',
  'quite','quota','quote','racer','radar','radii','radio','rainy','raise','rally',
  'ramen','ranch','range','rapid','rarer','ratio','raven','rayon','razor','reach',
  'react','ready','realm','rearm','rebar','rebel','rebus','recap','recur','reedy',
  'refer','refit','regal','reign','relax','relay','relic','remit','renew','repay',
  'reply','rerun','reset','resin','retro','retry','reuse','revel','revue','rhino',
  'rhyme','rider','ridge','right','rigid','rigor','rinse','ripen','riper','risen',
  'riser','rival','river','rivet','roast','robin','robot','rocky','rodeo','roomy',
  'roost','rotor','rouge','rough','round','rouse','route','rover','rower','royal',
  'rugby','ruler','rumba','rumor','rupee','rural','rusty','safer','saint','salad',
  'salon','salsa','salty','salve','salvo','sandy','saner','satin','sauce','saucy',
  'sauna','saute','savor','savoy','savvy','scale','scamp','scant','scarf','scene',
  'scent','scion','scone','scoop','scope','score','scour','scout','scram','scrap',
  'scree','scrub','scrum','scuba','sedan','segue','seize','sense','sepia','serif',
  'serum','serve','setup','seven','shade','shady','shaft','shake','shale','shall',
  'shape','shard','share','shark','sharp','shave','shawl','shear','sheen','sheep',
  'sheer','sheet','shelf','shell','shift','shine','shiny','shire','shirt','shoal',
  'shock','shone','shook','shore','shorn','short','shout','shove','shown','showy',
  'shrew','shrub','shrug','shuck','shunt','siege','sieve','sight','sigma','silky',
  'since','sinew','singe','siren','sixth','sixty','skate','skier','skiff','skill',
  'skimp','skirt','skulk','slack','slain','slant','slate','sleek','sleep','sleet',
  'slept','slice','slick','slide','sling','slink','sloop','slope','sloth','slump',
  'slung','slurp','slush','small','smart','smash','smell','smelt','smile','smith',
  'smock','smoke','smoky','snack','snail','snare','snarl','sneak','sniff','snipe',
  'snoop','snore','snort','snout','snowy','snuck','soapy','sober','solar','solid',
  'solve','sonar','sonic','sooth','sorry','sound','south','sower','space','spade',
  'spare','spark','spawn','speak','spear','speck','speed','spell','spelt','spend',
  'spent','spice','spicy','spied','spiel','spike','spiky','spill','spilt','spine',
  'spire','spite','split','spoil','spoke','spoof','spool','spoon','spore','sport',
  'spout','spray','spree','sprig','spurn','spurt','squad','squat','stack','staff',
  'stage','staid','stain','stair','stake','stale','stalk','stall','stamp','stand',
  'stare','stark','start','stash','state','stave','stead','steak','steal','steam',
  'steed','steel','steep','steer','stein','stern','stick','stiff','still','stilt',
  'sting','stint','stock','stoic','stoke','stole','stomp','stone','stony','stood',
  'stool','stoop','store','stork','storm','story','stout','stove','strap','straw',
  'stray','strip','strut','stuck','study','stuff','stump','stung','stunk','stunt',
  'style','suave','sugar','suite','sulky','sumac','sunny','super','surer','surge',
  'surly','sushi','swamp','swarm','swash','swath','sweat','sweep','sweet','swell',
  'swept','swift','swing','swirl','swish','swoon','swoop','sword','swore','sworn',
  'swung','syrup','tabby','table','tacit','taffy','taken','taker','tally','talon',
  'tamer','tango','tangy','taper','tapir','tardy','tarot','taste','tasty','taunt',
  'tawny','teach','tease','teddy','teeth','tempo','tenet','tenor','tense','tenth',
  'tepee','tepid','terra','terse','thank','their','theme','there','these','theta',
  'thick','thigh','thing','think','third','thorn','those','three','threw','throb',
  'throw','thrum','thumb','thump','thyme','tiara','tibia','tidal','tiger','tight',
  'tilde','timer','timid','titan','tithe','title','toast','today','toddy','token',
  'tonal','tonga','tonic','tooth','topaz','topic','torch','torso','torus','total',
  'totem','touch','tough','towel','tower','trace','track','tract','trade','trail',
  'train','trait','tramp','trawl','tread','treat','trend','triad','trial','tribe',
  'trice','trick','tried','tripe','trite','troll','troop','trope','trout','trove',
  'truce','truck','truer','truly','trump','trunk','truss','trust','truth','tryst',
  'tulip','tulle','tunic','turbo','tutor','twang','tweak','tweed','tweet','twice',
  'twine','twirl','twist','twixt','tying','ultra','umbra','uncle','uncut','under',
  'undid','undue','unfed','unfit','unify','union','unite','unity','unlit','unmet',
  'unset','untie','until','unzip','upper','upset','urban','usage','usher','using',
  'usual','usurp','utile','utter','vague','valet','valid','valor','value','valve',
  'vapor','vault','vaunt','vegan','venue','verge','verse','verso','verve','vicar',
  'video','vigil','vigor','villa','vinyl','viola','viper','viral','visit','visor',
  'vista','vital','vivid','vixen','vocal','vogue','voice','voila','voter','vouch',
  'vowel','vying','wacky','wafer','wager','wagon','waist','waive','waltz','waste',
  'watch','water','waver','waxen','weary','weave','wedge','weigh','weird','whale',
  'wharf','wheat','wheel','whelp','where','which','whiff','while','whine','whirl',
  'whisk','white','whole','whoop','whose','widen','wider','widow','width','wield',
  'wince','winch','windy','wiser','wispy','witty','woken','woman','women','woody',
  'wooly','wordy','world','worry','worse','worst','worth','would','wound','woven',
  'wrack','wrath','wreak','wreck','wrest','wring','wrist','write','wrong','wrote',
  'wrung','wryly','yacht','yearn','yeast','yield','young','youth','zebra','zesty',
  'zonal',
];

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function randomInt(max, cryptoObj = globalThis.crypto) {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError('max must be a positive integer');
  if (max === 1) return 0;
  const range = 0x100000000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  while (true) {
    cryptoObj.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

function pickChar(str, cryptoObj) {
  return str[randomInt(str.length, cryptoObj)];
}

function shuffle(arr, cryptoObj) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, cryptoObj);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function generateRandomPassword(
  { length = LIMITS.random.default, numbers = true, symbols = true } = {},
  cryptoObj = globalThis.crypto
) {
  const len = clampInt(length, LIMITS.random.min, LIMITS.random.max, LIMITS.random.default);
  const required = [pickChar(CHARSETS.lower, cryptoObj), pickChar(CHARSETS.upper, cryptoObj)];
  let pool = CHARSETS.lower + CHARSETS.upper;
  if (numbers) {
    required.push(pickChar(CHARSETS.digits, cryptoObj));
    pool += CHARSETS.digits;
  }
  if (symbols) {
    required.push(pickChar(CHARSETS.symbols, cryptoObj));
    pool += CHARSETS.symbols;
  }
  const chars = [...required];
  while (chars.length < len) {
    chars.push(pickChar(pool, cryptoObj));
  }
  return shuffle(chars, cryptoObj).join('');
}

export function generateMemorablePassword(
  { words = LIMITS.memorable.default, capitalize = true, separator = '-' } = {},
  cryptoObj = globalThis.crypto
) {
  const count = clampInt(words, LIMITS.memorable.min, LIMITS.memorable.max, LIMITS.memorable.default);
  const sep = SEPARATORS.includes(separator) ? separator : '-';
  const picked = [];
  for (let i = 0; i < count; i++) {
    const w = WORDLIST[randomInt(WORDLIST.length, cryptoObj)];
    picked.push(capitalize ? w[0].toUpperCase() + w.slice(1) : w);
  }
  return picked.join(sep);
}

export function generatePin({ length = LIMITS.pin.default } = {}, cryptoObj = globalThis.crypto) {
  const len = clampInt(length, LIMITS.pin.min, LIMITS.pin.max, LIMITS.pin.default);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += pickChar(CHARSETS.digits, cryptoObj);
  }
  return out;
}

export function estimateStrength({ mode = 'random', length = 16, numbers = true, symbols = true, words = 4 } = {}) {
  let bits = 0;
  if (mode === 'random') {
    const len = clampInt(length, LIMITS.random.min, LIMITS.random.max, LIMITS.random.default);
    const poolSize = CHARSETS.lower.length + CHARSETS.upper.length
      + (numbers ? CHARSETS.digits.length : 0)
      + (symbols ? CHARSETS.symbols.length : 0);
    bits = len * Math.log2(poolSize);
  } else if (mode === 'memorable') {
    const count = clampInt(words, LIMITS.memorable.min, LIMITS.memorable.max, LIMITS.memorable.default);
    bits = count * Math.log2(WORDLIST.length);
  } else {
    const len = clampInt(length, LIMITS.pin.min, LIMITS.pin.max, LIMITS.pin.default);
    bits = len * Math.log2(10);
  }
  const rounded = Math.round(bits);
  if (bits < 40) return { bits: rounded, level: 'weak', label: '偏弱' };
  if (bits < 60) return { bits: rounded, level: 'fair', label: '一般' };
  if (bits < 80) return { bits: rounded, level: 'strong', label: '强' };
  return { bits: rounded, level: 'very-strong', label: '极强' };
}

export function tokenizePassword(password, mode = 'random', separator = '-') {
  const tokens = [];
  for (const ch of password) {
    if (mode === 'memorable' && ch === separator) {
      tokens.push({ ch, cls: 'ch-sep' });
    } else if (ch >= '0' && ch <= '9') {
      tokens.push({ ch, cls: 'ch-num' });
    } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      tokens.push({ ch, cls: 'ch-alpha' });
    } else {
      tokens.push({ ch, cls: 'ch-sym' });
    }
  }
  return tokens;
}

export function normalizeHistoryItems(raw, limit = HISTORY_LIMIT) {
  if (!Array.isArray(raw)) return [];
  const cap = clampInt(limit, 1, 500, HISTORY_LIMIT);
  const valid = [];
  for (const item of raw) {
    if (!item || typeof item.password !== 'string' || item.password.length === 0) continue;
    const copiedAt = Number(item.copied_at ?? item.copiedAt);
    if (!Number.isFinite(copiedAt) || copiedAt < 0) continue;
    valid.push({
      id: item.id ?? null,
      password: item.password,
      copied_at: Math.trunc(copiedAt),
    });
  }
  valid.sort((a, b) => (b.copied_at - a.copied_at) || (Number(b.id || 0) - Number(a.id || 0)));
  const seen = new Set();
  const deduped = [];
  for (const item of valid) {
    if (seen.has(item.password)) continue;
    seen.add(item.password);
    deduped.push(item);
    if (deduped.length >= cap) break;
  }
  return deduped;
}

export function upsertHistoryItem(items, password, copiedAt = Date.now(), limit = HISTORY_LIMIT) {
  if (typeof password !== 'string' || password.length === 0) {
    return normalizeHistoryItems(items, limit);
  }
  const cap = clampInt(limit, 1, 500, HISTORY_LIMIT);
  const ts = Number.isFinite(Number(copiedAt)) ? Math.trunc(Number(copiedAt)) : Date.now();
  const rest = normalizeHistoryItems(items, cap).filter(item => item.password !== password);
  return [{ id: null, password, copied_at: ts }, ...rest].slice(0, cap);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatFullHistoryTime(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatHistoryTime(timestamp, now = Date.now()) {
  const d = new Date(timestamp);
  const ref = new Date(now);
  if (Number.isNaN(d.getTime())) return '';
  const timePart = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const mdPart = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (!Number.isNaN(ref.getTime()) && d.getFullYear() === ref.getFullYear()) {
    return `${mdPart} ${timePart}`;
  }
  return `${d.getFullYear()}-${mdPart} ${timePart}`;
}

function createIcon(doc, href) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', href);
  svg.appendChild(use);
  return { svg, use };
}

async function copyText(text, doc) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  doc.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = doc.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

export function initPasswordGenerator(doc = document) {
  const state = {
    mode: 'random',
    random: { length: LIMITS.random.default, numbers: true, symbols: true },
    memorable: { words: LIMITS.memorable.default, capitalize: true, separator: '-' },
    pin: { length: LIMITS.pin.default },
    current: '',
  };

  const tabs = [...doc.querySelectorAll('.seg-tab[data-mode]')];
  const panels = [...doc.querySelectorAll('[data-panel]')];
  const lenRange = doc.getElementById('lenRange');
  const lenNum = doc.getElementById('lenNum');
  const optNumbers = doc.getElementById('optNumbers');
  const optSymbols = doc.getElementById('optSymbols');
  const wordRange = doc.getElementById('wordRange');
  const wordNum = doc.getElementById('wordNum');
  const optCap = doc.getElementById('optCap');
  const sepPills = [...doc.querySelectorAll('.sep-pill[data-sep]')];
  const pinRange = doc.getElementById('pinRange');
  const pinNum = doc.getElementById('pinNum');
  const pwOutput = doc.getElementById('pwOutput');
  const pwText = doc.getElementById('pwText');
  const strengthBadge = doc.getElementById('strengthBadge');
  const strengthText = doc.getElementById('strengthText');
  const copyBtn = doc.getElementById('copyBtn');
  const copyBtnIcon = doc.getElementById('copyBtnIcon');
  const copyBtnText = doc.getElementById('copyBtnText');
  const refreshBtn = doc.getElementById('refreshBtn');
  const themeToggle = doc.getElementById('themeToggle');
  const toastEl = doc.getElementById('toast');
  const generatorView = doc.getElementById('generatorView');
  const historyView = doc.getElementById('historyView');
  const historyBtn = doc.getElementById('historyBtn');
  const historyCount = doc.getElementById('historyCount');
  const historyBackBtn = doc.getElementById('historyBackBtn');
  const historyMeta = doc.getElementById('historyMeta');
  const historyClearBtn = doc.getElementById('historyClearBtn');
  const historyClearText = doc.getElementById('historyClearText');
  const historyError = doc.getElementById('historyError');
  const historyErrorText = doc.getElementById('historyErrorText');
  const historyRetryBtn = doc.getElementById('historyRetryBtn');
  const historyLoading = doc.getElementById('historyLoading');
  const historyEmpty = doc.getElementById('historyEmpty');
  const historyList = doc.getElementById('historyList');

  let toastTimer = null;
  let copyTimer = null;
  let pulseTimer = null;
  let spinTimer = null;
  let clearConfirmTimer = null;
  let clearConfirming = false;
  let historyOpen = false;
  let historyLoaded = false;
  let historyFetching = false;
  let historyErrorMsg = '';
  let historyItems = [];
  let syncEpoch = 0;
  let writeQueue = Promise.resolve();

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function resetClearConfirm() {
    clearConfirming = false;
    clearTimeout(clearConfirmTimer);
    historyClearBtn.classList.remove('confirming');
    historyClearText.textContent = '清空';
  }

  function renderHistory() {
    const count = historyItems.length;
    historyCount.textContent = String(count);
    historyCount.classList.toggle('hidden', count === 0);
    historyMeta.textContent = `${count} / ${HISTORY_LIMIT}`;
    historyClearBtn.disabled = count === 0;
    if (count === 0) resetClearConfirm();

    historyError.classList.toggle('hidden', !historyErrorMsg);
    if (historyErrorMsg) historyErrorText.textContent = historyErrorMsg;

    const showLoading = historyFetching && !historyLoaded && count === 0;
    historyLoading.classList.toggle('hidden', !showLoading);
    historyEmpty.classList.toggle('hidden', showLoading || count > 0);
    historyList.classList.toggle('hidden', count === 0);

    const frag = doc.createDocumentFragment();
    const now = Date.now();
    for (const item of historyItems) {
      const li = doc.createElement('li');
      li.className = 'hist-item';

      const main = doc.createElement('div');
      main.className = 'hist-main';

      const pwEl = doc.createElement('div');
      pwEl.className = 'hist-pw';
      for (const token of tokenizePassword(item.password, 'random')) {
        const span = doc.createElement('span');
        span.className = token.cls;
        span.textContent = token.ch;
        pwEl.appendChild(span);
      }

      const timeEl = doc.createElement('div');
      timeEl.className = 'hist-time';
      timeEl.textContent = formatHistoryTime(item.copied_at, now);
      timeEl.title = formatFullHistoryTime(item.copied_at);

      main.appendChild(pwEl);
      main.appendChild(timeEl);

      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'hist-copy-btn';
      btn.setAttribute('aria-label', '复制此历史密码');
      const { svg, use } = createIcon(doc, '#i-copy');
      const label = doc.createElement('span');
      label.textContent = '复制';
      btn.appendChild(svg);
      btn.appendChild(label);

      let btnTimer = null;
      btn.addEventListener('click', async () => {
        const ok = await copyText(item.password, doc);
        if (!ok) {
          showToast('复制失败，请手动选中复制');
          return;
        }
        btn.classList.add('copied');
        use.setAttribute('href', '#i-check');
        label.textContent = '已复制';
        showToast('已从历史复制密码');
        clearTimeout(btnTimer);
        btnTimer = setTimeout(() => {
          btn.classList.remove('copied');
          use.setAttribute('href', '#i-copy');
          label.textContent = '复制';
        }, 1500);
      });

      li.appendChild(main);
      li.appendChild(btn);
      frag.appendChild(li);
    }
    historyList.replaceChildren(frag);
  }

  async function requestHistory(method, body) {
    const opts = { method, cache: 'no-store' };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(HISTORY_ENDPOINT, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return normalizeHistoryItems(data?.items, HISTORY_LIMIT);
  }

  async function fetchHistory({ silent = false } = {}) {
    const reqEpoch = ++syncEpoch;
    historyFetching = true;
    if (!silent) historyErrorMsg = '';
    renderHistory();
    try {
      await writeQueue;
      if (reqEpoch !== syncEpoch) return;
      const items = await requestHistory('GET');
      if (reqEpoch !== syncEpoch) return;
      historyItems = items;
      historyLoaded = true;
      historyErrorMsg = '';
    } catch {
      if (reqEpoch !== syncEpoch) return;
      if (!silent) historyErrorMsg = '云端历史加载失败，请检查网络后重试';
    } finally {
      if (reqEpoch === syncEpoch) {
        historyFetching = false;
        renderHistory();
      }
    }
  }

  function enqueueRecordHistory(password) {
    const copiedAt = Date.now();
    const reqEpoch = ++syncEpoch;
    historyItems = upsertHistoryItem(historyItems, password, copiedAt, HISTORY_LIMIT);
    renderHistory();
    writeQueue = writeQueue.then(async () => {
      try {
        const items = await requestHistory('POST', { password });
        if (reqEpoch !== syncEpoch) return;
        historyItems = items;
        historyLoaded = true;
        historyErrorMsg = '';
        renderHistory();
      } catch {
        if (reqEpoch === syncEpoch) {
          historyErrorMsg = '云端历史同步失败，请稍后重试';
          renderHistory();
        }
        showToast('密码已复制，但云端历史同步失败');
      }
    });
  }

  function setHistoryOpen(open) {
    historyOpen = open;
    generatorView.classList.toggle('hidden', open);
    historyView.classList.toggle('hidden', !open);
    historyBtn.classList.toggle('active', open);
    historyBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      resetClearConfirm();
      fetchHistory({ silent: false });
    } else {
      resetClearConfirm();
    }
  }

  function updateRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Number(input.value);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--p', `${pct.toFixed(2)}%`);
  }

  function renderPassword(animate = false) {
    let pw = '';
    if (state.mode === 'random') {
      pw = generateRandomPassword(state.random);
    } else if (state.mode === 'memorable') {
      pw = generateMemorablePassword(state.memorable);
    } else {
      pw = generatePin(state.pin);
    }
    state.current = pw;

    const frag = doc.createDocumentFragment();
    for (const token of tokenizePassword(pw, state.mode, state.memorable.separator)) {
      const span = doc.createElement('span');
      span.className = token.cls;
      span.textContent = token.ch;
      frag.appendChild(span);
    }
    pwText.replaceChildren(frag);
    pwText.classList.toggle('len-md', pw.length > 24 && pw.length <= 48);
    pwText.classList.toggle('len-lg', pw.length > 48);

    if (animate) {
      pwText.classList.add('pulse');
      clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => pwText.classList.remove('pulse'), 110);
    }

    const strength = estimateStrength({
      mode: state.mode,
      length: state.mode === 'pin' ? state.pin.length : state.random.length,
      numbers: state.random.numbers,
      symbols: state.random.symbols,
      words: state.memorable.words,
    });
    strengthBadge.dataset.level = strength.level;
    strengthBadge.title = `约 ${strength.bits} bits 熵值`;
    strengthText.textContent = strength.label;
  }

  function setMode(nextMode) {
    state.mode = nextMode;
    for (const tab of tabs) {
      const active = tab.dataset.mode === nextMode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    for (const panel of panels) {
      panel.classList.toggle('hidden', panel.dataset.panel !== nextMode);
    }
    renderPassword(true);
  }

  function bindRangePair(rangeEl, numEl, limits, onChange) {
    updateRangeFill(rangeEl);
    rangeEl.addEventListener('input', () => {
      const val = clampInt(rangeEl.value, limits.min, limits.max, limits.default);
      numEl.value = String(val);
      updateRangeFill(rangeEl);
      onChange(val);
      renderPassword(false);
    });
    numEl.addEventListener('input', () => {
      const raw = numEl.value.trim();
      if (!/^\d+$/.test(raw)) return;
      const n = Number.parseInt(raw, 10);
      if (n >= limits.min && n <= limits.max) {
        rangeEl.value = String(n);
        updateRangeFill(rangeEl);
        onChange(n);
        renderPassword(false);
      }
    });
    const commitNum = () => {
      const val = clampInt(numEl.value, limits.min, limits.max, limits.default);
      numEl.value = String(val);
      rangeEl.value = String(val);
      updateRangeFill(rangeEl);
      onChange(val);
      renderPassword(false);
    };
    numEl.addEventListener('change', commitNum);
    numEl.addEventListener('blur', commitNum);
  }

  async function handleCopy() {
    const password = state.current;
    if (!password) return;
    const ok = await copyText(password, doc);
    if (!ok) {
      showToast('复制失败，请手动选中复制');
      return;
    }
    copyBtn.classList.add('copied');
    copyBtnIcon.setAttribute('href', '#i-check');
    copyBtnText.textContent = '已复制';
    showToast('密码已复制到剪贴板');
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtnIcon.setAttribute('href', '#i-copy');
      copyBtnText.textContent = '复制密码';
    }, 1600);
    enqueueRecordHistory(password);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      if (tab.dataset.mode !== state.mode) setMode(tab.dataset.mode);
    });
  }

  bindRangePair(lenRange, lenNum, LIMITS.random, v => { state.random.length = v; });
  bindRangePair(wordRange, wordNum, LIMITS.memorable, v => { state.memorable.words = v; });
  bindRangePair(pinRange, pinNum, LIMITS.pin, v => { state.pin.length = v; });

  optNumbers.addEventListener('change', () => {
    state.random.numbers = optNumbers.checked;
    renderPassword(true);
  });
  optSymbols.addEventListener('change', () => {
    state.random.symbols = optSymbols.checked;
    renderPassword(true);
  });
  optCap.addEventListener('change', () => {
    state.memorable.capitalize = optCap.checked;
    renderPassword(true);
  });
  for (const pill of sepPills) {
    pill.addEventListener('click', () => {
      state.memorable.separator = pill.dataset.sep;
      for (const p of sepPills) {
        const active = p === pill;
        p.classList.toggle('active', active);
        p.setAttribute('aria-checked', String(active));
      }
      renderPassword(true);
    });
  }

  copyBtn.addEventListener('click', handleCopy);
  pwOutput.addEventListener('click', handleCopy);
  pwOutput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCopy();
    }
  });

  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.remove('spinning');
    void refreshBtn.offsetWidth;
    refreshBtn.classList.add('spinning');
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => refreshBtn.classList.remove('spinning'), 300);
    renderPassword(true);
  });

  themeToggle.addEventListener('click', () => {
    const next = doc.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    doc.documentElement.dataset.theme = next;
    try { localStorage.setItem('ag_theme', next); } catch {}
  });

  historyBtn.addEventListener('click', () => {
    setHistoryOpen(!historyOpen);
  });
  historyBackBtn.addEventListener('click', () => {
    setHistoryOpen(false);
    historyBtn.focus();
  });
  historyRetryBtn.addEventListener('click', () => {
    fetchHistory({ silent: false });
  });
  historyClearBtn.addEventListener('click', () => {
    if (historyItems.length === 0) return;
    if (!clearConfirming) {
      clearConfirming = true;
      historyClearBtn.classList.add('confirming');
      historyClearText.textContent = '确认清空？';
      clearTimeout(clearConfirmTimer);
      clearConfirmTimer = setTimeout(resetClearConfirm, 3500);
      return;
    }
    resetClearConfirm();
    const reqEpoch = ++syncEpoch;
    writeQueue = writeQueue.then(async () => {
      try {
        const items = await requestHistory('DELETE', {});
        if (reqEpoch !== syncEpoch) return;
        historyItems = items;
        historyLoaded = true;
        historyErrorMsg = '';
        renderHistory();
        showToast('已清空密码历史');
      } catch {
        if (reqEpoch === syncEpoch) {
          historyErrorMsg = '清空失败，请稍后重试';
          renderHistory();
        }
        showToast('清空历史失败');
      }
    });
  });

  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape' && historyOpen) {
      setHistoryOpen(false);
      historyBtn.focus();
    }
  });
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden && historyOpen) fetchHistory({ silent: false });
  });

  renderPassword(false);
  renderHistory();
  fetchHistory({ silent: true });
}

if (typeof document !== 'undefined') {
  initPasswordGenerator(document);
}
