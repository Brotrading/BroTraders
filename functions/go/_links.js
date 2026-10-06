// Canonical map: short slug → real affiliate URL.
// Update affiliate URLs in this ONE place — every /go/<slug> link on the
// site auto-uses the new value. Slugs must be lowercase.

export const LINKS = {
  // Prop firms
  apex:        'https://apextraderfunding.com/member/aff/go/buurtie',
  alpha:       'https://app.alpha-futures.com/signup/BROTRADING/',
  daytraders:  'https://daytraders.com/go/brotrading?c=TWCEMMNK',
  // FundedSeat went bankrupt (2026-09-29) — removed from the site. Old
  // links (YouTube descriptions, past giveaway posts) still point here, so
  // redirect home instead of 404ing or sending traffic to their dead/
  // possibly-squatted domain.
  fundedseat:  'https://propfirmbro.com/',
  lucid:       'https://lucidtrading.com/ref/brotrading/',
  phidias:     'https://member.phidiaspropfirm.com/aff/go/brotrading',
  mffu:        'https://myfundedfutures.com/challenge?ref=5117',
  // NexGen went bankrupt (2026-10-05) — removed from the site. Old links
  // (YouTube descriptions, giveaway posts) still use /go/nexgen: send them
  // home instead of 404ing or to a dead/possibly-squatted domain.
  nexgen:      'https://propfirmbro.com/',
  topone:      'https://toponefutures.com/?linkId=lp_707970&sourceId=bro&tenantId=toponefutures',
  tradeify:    'https://tradeify.co/?ref=BFYQ2HKM',
  yrm:         'https://yrmprop.com/ref/Bro/',
  takeprofittrader: 'https://takeprofittrader.com/?referralCode=BRO',
  fundednext:       'https://fundednext.com?fpr=bro',
  legendstrading:   'https://thelegendstrading.com/?ref=BRO',
  iqcapital:        'https://checkout.iqcapital.io/products?aff=bro',
  // BluSky (2026-08-20): affiliate code not assigned yet — confirm with Mike
  // before this appears anywhere on the site as "code: ...".
  blusky:           'https://trader.blusky.pro/sign-up?referral_id=f62c97d674d218879457',

  // Tools / partners
  bookmap:     'https://bookmap.com/members/aff/aff',
  ibkr:        'https://ibkr.com/referral/mike338',
  tradingview: 'https://www.tradingview.com/?aff_id=165977&aff_sub=BRO&source=BRO',
  tradezella:  'https://refer.tradezella.com/mike-korevaar',
  menthorq:    'https://menthorq.com/membership/premium-monthly/?coupon=M326&aff=BroTrading',
  atas:        'https://atas.net/?rs=partners_oft590183',
};
