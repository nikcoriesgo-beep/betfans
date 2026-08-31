import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { FileText, Mail, Globe, ChevronRight } from "lucide-react";

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-10">
    <h2 className="text-xl font-display font-bold text-primary border-b border-primary/20 pb-3 mb-5 flex items-center gap-2">
      <ChevronRight size={18} className="text-primary/60" />
      {title}
    </h2>
    <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const Sub = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <div id={id} className="mb-4">
    <h3 className="font-semibold text-foreground mb-2">{title}</h3>
    <div className="space-y-2">{children}</div>
  </div>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 ml-4">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2">
        <span className="text-primary mt-1">•</span>
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const TableRow = ({ cols }: { cols: string[] }) => (
  <tr className="border-b border-white/5">
    {cols.map((c, i) => (
      <td key={i} className={`px-4 py-2.5 text-sm ${i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{c}</td>
    ))}
  </tr>
);

export default function OfficialRules() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-20 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-4">
            <FileText size={14} className="text-primary" />
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">Legal Document</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4" data-testid="text-official-rules-heading">
            Official Platform Rules
          </h1>
          <p className="text-xl text-muted-foreground mb-6">Terms of Participation — BetFans.us</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline" className="text-xs">Document Version 1.3</Badge>
            <Badge variant="outline" className="text-xs">Effective Date: April 27, 2026</Badge>
            <a href="mailto:nikcox@betfans.us" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Mail size={12} /> nikcox@betfans.us
            </a>
          </div>
        </div>

        {/* Table of Contents */}
        <div className="bg-card/40 border border-white/10 rounded-2xl p-6 mb-10">
          <h2 className="font-display font-bold text-base mb-4">Table of Contents</h2>
          <ol className="grid sm:grid-cols-2 gap-1.5">
            {[
              ["1", "General Information & Legal Status"],
              ["2", "Membership Tiers & Fees"],
              ["3", "How to Make Predictions"],
              ["4", "Scoring & Leaderboards"],
              ["5", "Prize Pool Eligibility & Payouts"],
              ["6", "Game Postponements & Disputes"],
              ["7", "Referral Program"],
              ["8", "Community Features"],
              ["9", "Account Management"],
              ["10", "Disclaimers & Limitation of Liability"],
              ["11", "Governing Law & Dispute Resolution"],
              ["12", "Amendments & Entire Agreement"],
            ].map(([num, title]) => (
              <li key={num}>
                <a
                  href={`#section-${num}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                >
                  <span className="w-6 h-6 rounded bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{num}</span>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </div>

        {/* Document Content */}
        <div className="bg-card/20 border border-white/5 rounded-2xl p-6 md:p-10 space-y-2">

          <Section id="section-1" title="Section 1: General Information & Legal Status">
            <Sub id="1-1" title="1.1 Platform Description">
              <p>BetFans.us (hereinafter "BetFans," "the Platform," "the Company," or "we") is a membership-based sports prediction platform operating in the United States. BetFans enables registered members to make daily predictions on professional and collegiate sporting events and to compete for cash prizes drawn from a communal prize pool funded by membership fees.</p>
              <p className="font-semibold text-foreground">BetFans IS NOT A SPORTS BETTING OPERATOR.</p>
              <p>No wagers are placed, no gambling licenses are required of members, and no money is "bet" against the house or other members. The Platform constitutes a SKILL-BASED PREDICTION CONTEST in which participants pay a membership subscription fee for access to platform tools, leaderboard competition, and prize pool eligibility.</p>
            </Sub>
            <Sub id="1-2" title="1.2 Legal Jurisdiction & Eligibility">
              <p>Membership in and participation on BetFans is subject to applicable federal, state, and local laws. By registering, you represent and warrant that:</p>
              <BulletList items={[
                "You are at least eighteen (18) years of age, or the legal age of majority in your jurisdiction, whichever is greater.",
                "You are a legal resident or citizen of a jurisdiction in which participation in skill-based prediction contests for prizes is lawful.",
                "You are not located in a jurisdiction that prohibits paid prediction contests, fantasy sports, or similar activities.",
                "You are not an employee, officer, director, agent, or immediate family member of BetFans or any affiliated entity.",
              ]} />
              <p className="italic">Note: It is your responsibility to determine whether participation is legal in your jurisdiction. BetFans makes no representation that the Platform is appropriate or available in all locations.</p>
            </Sub>
            <Sub id="1-3" title="1.3 Agreement to Terms">
              <p>By creating an account, purchasing a membership, or making any prediction on the Platform, you acknowledge that you have read, understood, and agree to be bound by these Official Platform Rules & Terms of Participation ("Rules"), the BetFans Privacy Policy, and any additional terms incorporated herein by reference. These Rules constitute a legally binding agreement between you and BetFans.</p>
            </Sub>
          </Section>

          <Section id="section-2" title="Section 2: Membership Tiers & Fees">
            <Sub id="2-1" title="2.1 Membership Structure">
              <p>BetFans offers three (3) membership tiers. Membership fees are billed on a recurring monthly basis. All fees are stated in U.S. Dollars (USD).</p>
              <div className="overflow-x-auto rounded-xl border border-white/10 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 text-xs uppercase tracking-widest">
                      <th className="px-4 py-3 text-left font-semibold">Tier</th>
                      <th className="px-4 py-3 text-left font-semibold">Monthly Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableRow cols={["Legend", "$99/mo"]} />
                  </tbody>
                </table>
              </div>
            </Sub>
            <Sub id="2-2" title="2.2 Daily Prize Competition">
              <p>BetFans members compete daily for available cash prizes. Prize availability, amounts, and structure are determined solely by BetFans and are subject to change at any time without notice. No guaranteed prize amount is promised or implied. Participation does not guarantee receipt of any prize.</p>
            </Sub>
            <Sub id="2-3" title="2.3 Subscription Billing & Cancellation">
              <p>Membership fees are billed on a monthly recurring basis to the payment method on file. Subscriptions automatically renew unless cancelled prior to the next billing cycle. Members may cancel at any time through their account settings or by contacting support at nikcox@betfans.us. No prorated refunds will be issued for partial months of service.</p>
            </Sub>
          </Section>

          <Section id="section-3" title="Section 3: How to Make Predictions">
            <Sub id="3-1" title="3.1 Available Leagues">
              <p>Members may make predictions on games from the following leagues (availability subject to season schedules and BetFans operational decisions):</p>
              <BulletList items={[
                "NBA — National Basketball Association",
                "NHL — National Hockey League",
                "MLB — Major League Baseball",
                "NFL — National Football League",
                "MLS — Major League Soccer",
                "NCAAF — NCAA Division 1 College Football Playoff Champions",
                "NCAABB — NCAA Division I Men's Basketball March Madness",
                "NCAAB — NCAA Division 1 Men's Baseball World Series",
                "Additional leagues as announced by BetFans from time to time",
              ]} />
            </Sub>
            <Sub id="3-2" title="3.2 Prediction Types">
              <p>Members may submit predictions only in the following format for every game:</p>
              <BulletList items={["Moneyline: Predicting which team will win the game outright, regardless of margin."]} />
            </Sub>
            <Sub id="3-3" title="3.3 Real-Time Lines">
              <p>Odds and lines displayed on the Platform are updated in real time throughout each game day. A member's submitted prediction is locked at the line active at the moment of submission.</p>
            </Sub>
            <Sub id="3-4" title="3.4 Prediction Deadlines & Lock Times">
              <p>Predictions must be submitted prior to the official scheduled start time of each game. Predictions submitted after the game's lock time will not be accepted. Game postponements, cancellations, or rescheduling will be handled per Section 6.</p>
            </Sub>
          </Section>

          <Section id="section-4" title="Section 4: Scoring & Leaderboards">
            <Sub id="4-1" title="4.1 Points System">
              <p>Members earn points for each correct prediction submitted. Incorrect predictions do not result in a deduction of points from the member's cumulative total, unless BetFans announces a negative-scoring variant for a specific contest period.</p>
            </Sub>
            <Sub id="4-2" title="4.2 Daily Leaderboard">
              <BulletList items={[
                "The Daily Leaderboard resets each calendar day at 12:00 AM Pacific Time (PT).",
                "A member's Daily Leaderboard standing is calculated based on all correct predictions submitted and resolved within the current calendar day.",
                "The Daily Leaderboard prize pool distribution is announced separately on the Platform.",
              ]} />
            </Sub>
            <Sub id="4-3" title="4.3 Leaderboard Integrity">
              <p>BetFans reserves the right to investigate and correct leaderboard anomalies resulting from technical errors, data feed failures, or suspected fraud. Any member found to be manipulating leaderboard standings — including operating multiple accounts or exploiting software vulnerabilities — may be immediately disqualified and their account terminated without refund.</p>
            </Sub>
          </Section>

          <Section id="section-5" title="Section 5: Prize Pool Eligibility & Payouts">
            <Sub id="5-1" title="5.1 Daily Prize Pool Eligibility Requirements">
              <p>To be eligible for a daily prize pool distribution, a member must satisfy ALL of the following conditions on that calendar day:</p>
              <BulletList items={[
                "Submit a prediction on EVERY scheduled MLB game for that day, AND",
                "Submit a prediction on EVERY scheduled NBA game for that day, AND",
                "Submit a prediction on EVERY scheduled NHL game for that day.",
              ]} />
              <p className="font-semibold text-foreground">Missing even one (1) game across any of the three required sports on a given day will result in disqualification from that day's prize pool distribution. There are NO exceptions to this requirement.</p>
              <p className="italic">Note: This requirement applies only during the active seasons of each respective league.</p>
            </Sub>
            <Sub id="5-2" title="5.2 Prediction Confirmation">
              <p>It is the member's sole responsibility to confirm that all required predictions have been submitted and recorded by the Platform prior to each game's lock time. BetFans recommends that members verify submission confirmation messages.</p>
            </Sub>
            <Sub id="5-3" title="5.3 Payout Mechanics">
              <BulletList items={[
                'Payouts are processed automatically ("Auto Payouts") to the original payment method used at the time of membership registration.',
                "No manual withdrawal request is required or available.",
                "Processing times may vary depending on the member's financial institution.",
                "In the event that a payout cannot be processed (e.g., expired card, closed account), the member must update their payment information within thirty (30) days or the prize may be forfeited.",
                "BetFans reserves the right to withhold prize disbursement pending identity verification or fraud review.",
              ]} />
            </Sub>
            <Sub id="5-4" title="5.4 Prize Distribution">
              <p>BetFans determines prize amounts and distribution at its sole discretion. Prizes are awarded to the day's top qualifying predictor(s) based on the criteria described herein. Tied qualifiers split the prize equally. Prize amounts are subject to change at any time without notice. No minimum or guaranteed prize amount is promised or implied. Participation in the prediction platform does not guarantee receipt of any prize.</p>
            </Sub>
            <Sub id="5-6" title="5.6 Taxes">
              <p>Members are solely responsible for all federal, state, and local taxes applicable to prizes received from BetFans. BetFans will comply with applicable tax reporting requirements, including the issuance of IRS Form 1099 or equivalent documentation for prizes that meet or exceed applicable reporting thresholds.</p>
            </Sub>
          </Section>

          <Section id="section-6" title="Section 6: Game Postponements, Cancellations & Disputed Outcomes">
            <Sub id="6-1" title="6.1 Postponements & Cancellations">
              <p>In the event that a scheduled game is postponed, cancelled, or suspended before the completion of a regulation contest:</p>
              <BulletList items={[
                'Any prediction submitted for the affected game will be voided and will not count as a "miss" for daily prize pool eligibility purposes.',
                "Voided predictions will not contribute points to the leaderboard.",
                "If a game is rescheduled and ultimately played within the same calendar day, BetFans will determine on a case-by-case basis whether the rescheduled game counts toward that day's eligibility requirements.",
              ]} />
            </Sub>
            <Sub id="6-2" title="6.2 Official Results">
              <p>BetFans uses official game results as published by the relevant league or governing body to determine prediction outcomes. In the event of a discrepancy between official results and data displayed on the Platform, BetFans will use commercially reasonable efforts to correct the discrepancy.</p>
            </Sub>
            <Sub id="6-3" title="6.3 Result Disputes">
              <p>Members who believe a prediction outcome was incorrectly recorded must submit a dispute to <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline">nikcox@betfans.us</a> within forty-eight (48) hours of the relevant game's conclusion. BetFans will review and respond to disputes within five (5) business days. BetFans' determination shall be final and binding.</p>
            </Sub>
          </Section>

          <Section id="section-7" title="Section 7: Referral Program">
            <Sub id="7-1" title="7.1 Program Overview">
              <p>BetFans operates a member referral program through which existing members may earn compensation for recruiting new members to the Platform. Participation in the referral program is subject to these Rules and all applicable federal and state laws governing multi-level compensation structures.</p>
            </Sub>
            <Sub id="7-2" title="7.2 Referral Compensation Structure">
              <div className="overflow-x-auto rounded-xl border border-white/10 mt-2">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 text-xs uppercase tracking-widest">
                      <th className="px-4 py-3 text-left font-semibold">Referring Tier</th>
                      <th className="px-4 py-3 text-left font-semibold">Instant Payout</th>
                      <th className="px-4 py-3 text-left font-semibold">Monthly Residual</th>
                      <th className="px-4 py-3 text-left font-semibold">May Refer</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableRow cols={["Legend", "$50.00", "$50.00/mo", "Any member"]} />
                  </tbody>
                </table>
              </div>
            </Sub>
            <Sub id="7-3" title="7.3 Referral Restrictions & Conditions">
              <BulletList items={[
                "The instant referral payout is triggered upon the referred member's first completed subscription payment.",
                "The monthly residual payment continues for each calendar month the referred member maintains an active, paid membership.",
                "A referring member may only earn referral compensation for new members who have never previously held a BetFans account.",
                "Self-referrals are strictly prohibited and will result in immediate account termination and forfeiture of all accrued referral compensation.",
                "Referring members are responsible for any income tax liability arising from referral compensation received.",
                "BetFans reserves the right to modify, suspend, or terminate the referral program at any time upon thirty (30) days advance notice.",
              ]} />
            </Sub>
            <Sub id="7-4" title="7.4 FTC Disclosure Requirement">
              <p>Members who promote BetFans publicly and who stand to benefit financially from referrals must clearly and conspicuously disclose their material connection to BetFans in accordance with FTC guidelines (16 C.F.R. Part 255).</p>
            </Sub>
          </Section>

          <Section id="section-8" title="Section 8: Community Features">
            <Sub id="8-1" title="8.1 Community Platform Features">
              <p>BetFans provides optional community features including Member Profile Walls, Member Map, Community Badges, and Global Rankings.</p>
            </Sub>
            <Sub id="8-2" title="8.2 Community Conduct">
              <p>Members agree to use all community features in a lawful, respectful manner. The following conduct is strictly prohibited:</p>
              <BulletList items={[
                "Harassment, threats, or targeted abuse directed at other members.",
                "Posting content that is defamatory, obscene, discriminatory, or otherwise unlawful.",
                'Sharing another member\'s personal identifying information without consent ("doxxing").',
                "Spam, automated posting, or commercial solicitation unrelated to BetFans.",
                "Coordinated manipulation of picks or leaderboard standings.",
              ]} />
            </Sub>
          </Section>

          <Section id="section-9" title="Section 9: Account Management">
            <Sub id="9-1" title="9.1 Account Security">
              <p>Each member is responsible for maintaining the confidentiality of their account credentials. Members must notify BetFans immediately at <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline">nikcox@betfans.us</a> upon discovering any unauthorized use of their account.</p>
            </Sub>
            <Sub id="9-2" title="9.2 One Account Per Member">
              <p>Each individual is permitted to hold only one (1) active BetFans account at any time. Operating multiple accounts is grounds for immediate disqualification from prize pool eligibility and permanent account termination.</p>
            </Sub>
            <Sub id="9-3" title="9.3 Account Termination by Member">
              <p>Members may close their account at any time by contacting <a href="mailto:nikcox@betfans.us" className="text-primary hover:underline">nikcox@betfans.us</a>. Account closure terminates all prize pool eligibility, pending referral income, and platform access. No prorated refunds will be issued.</p>
            </Sub>
          </Section>

          <Section id="section-10" title="Section 10: Disclaimers, Limitation of Liability & Indemnification">
            <Sub id="10-1" title="10.1 No Guarantee of Winnings">
              <p className="font-semibold text-foreground uppercase text-xs tracking-wide">BETFANS DOES NOT GUARANTEE THAT ANY MEMBER WILL WIN ANY PRIZE. THE PLATFORM IS A SKILL-BASED COMPETITION AND RESULTS ARE DETERMINED BY MEMBER PERFORMANCE. PAST PERFORMANCE IS NOT INDICATIVE OF FUTURE RESULTS.</p>
            </Sub>
            <Sub id="10-2" title="10.2 Limitation of Liability">
              <p className="text-xs uppercase tracking-wide">TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BETFANS AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, AND SERVICE PROVIDERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, OR LOSS OF GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE PLATFORM. BETFANS' TOTAL AGGREGATE LIABILITY TO ANY MEMBER SHALL NOT EXCEED THE TOTAL MEMBERSHIP FEES PAID BY THAT MEMBER IN THE THREE (3) MONTHS PRECEDING THE CLAIM.</p>
            </Sub>
            <Sub id="10-3" title="10.3 Indemnification">
              <p>You agree to indemnify, defend, and hold harmless BetFans and its officers, directors, employees, agents, and assigns from and against any claims, liabilities, damages, losses, and expenses arising out of or in any way connected with: (a) your use of the Platform; (b) your violation of these Rules; (c) your violation of any applicable law or regulation; or (d) your violation of any third-party rights.</p>
            </Sub>
            <Sub id="10-4" title="10.4 Disclaimer of Warranties">
              <p className="text-xs uppercase tracking-wide">THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
            </Sub>
          </Section>

          <Section id="section-11" title="Section 11: Governing Law & Dispute Resolution">
            <Sub id="11-1" title="11.1 Governing Law">
              <p>These Rules shall be governed by and construed in accordance with the laws of the State of California, which are not considered Gambling, with regard to California law principles.</p>
            </Sub>
            <Sub id="11-2" title="11.2 Arbitration Agreement">
              <p className="text-xs uppercase tracking-wide">ANY DISPUTE, CLAIM, OR CONTROVERSY ARISING OUT OF OR RELATING TO THESE RULES OR THE PLATFORM SHALL BE RESOLVED BY BINDING INDIVIDUAL ARBITRATION ADMINISTERED UNDER THE RULES OF THE AMERICAN ARBITRATION ASSOCIATION ("AAA"), EXCEPT THAT EITHER PARTY MAY SEEK INJUNCTIVE OR OTHER EQUITABLE RELIEF IN A COURT OF COMPETENT JURISDICTION. YOU WAIVE YOUR RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION.</p>
            </Sub>
            <Sub id="11-3" title="11.3 Time Limitation on Claims">
              <p>Any claim arising out of or related to these Rules or the Platform must be filed within one (1) year after the cause of action accrues. Claims not filed within this period are permanently barred.</p>
            </Sub>
          </Section>

          <Section id="section-12" title="Section 12: Amendments & Entire Agreement">
            <p>BetFans reserves the right to modify these Rules at any time. Material changes will be communicated to active members via email at least thirty (30) days before taking effect. Your continued use of the Platform after the effective date of any amendment constitutes acceptance of the revised Rules.</p>
            <p>These Rules, together with the BetFans Privacy Policy and any promotional contest rules published on the Platform, constitute the entire agreement between you and BetFans with respect to your participation on the Platform and supersede all prior agreements, representations, and understandings.</p>
          </Section>

          {/* Contact Footer */}
          <div className="border-t border-white/10 pt-8 mt-8">
            <div className="flex flex-wrap gap-4 items-center justify-between text-sm">
              <div>
                <p className="font-semibold text-foreground mb-1">BetFans.us</p>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <a href="mailto:nikcox@betfans.us" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Mail size={14} /> nikcox@betfans.us
                  </a>
                  <a href="https://betfans.us" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Globe size={14} /> betfans.us
                  </a>
                </div>
              </div>
              <div className="text-right text-muted-foreground text-xs">
                <p>Document Version 1.3</p>
                <p>Effective: April 27, 2026</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
