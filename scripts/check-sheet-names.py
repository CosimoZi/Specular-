import re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
content = open(os.path.join(ROOT, 'src/calc/data/names-zh.ts'), encoding='utf-8').read()

def grab(name):
    m = re.search(rf'^  {name}: "([^"]+)"', content, re.MULTILINE)
    return m.group(1) if m else None

keys = [
    'CalamityQueller', 'StaffOfHoma', 'PrimordialJadeWingedSpear',
    'SkywardSpine', 'EngulfingLightning', 'StaffOfTheScarletSands',
    'DragonsBane', 'WhiteTassel', 'BlackTassel', 'Deathmatch',
    'LithicSpear', 'VortexVanquisher',
    'GladiatorsFinale', 'EmblemOfSeveredFate', 'HeartOfDepth',
    'CrimsonWitchOfFlames', 'ViridescentVenerer', 'ThunderingFury',
    'ArchaicPetra', 'DeepwoodMemories', 'HuskOfOpulentDreams',
    'ShimenawasReminiscence', 'VermillionHereafter', 'GoldenTroupe',
    'MarechausseeHunter', 'PaleFlame', 'BloodstainedChivalry',
    'DesertPavilionChronicle', 'GildedDreams', 'FlowerOfParadiseLost',
    'NymphsDream', 'Lavawalker', 'NoblesseOblige', 'BlizzardStrayer',
    'TenacityOfTheMillelith',
]
for k in keys:
    print(f'{k}: {grab(k)}')
