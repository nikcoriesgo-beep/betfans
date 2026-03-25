import {
  users, type User, type UpsertUser,
  predictions, type Prediction, type InsertPrediction,
  games, type Game, type InsertGame,
  chatMessages, type ChatMessage, type InsertChatMessage,
  transactions, type Transaction, type InsertTransaction,
  leaderboardEntries, type LeaderboardEntry,
  braggingPosts, type BraggingPost, type InsertBraggingPost,
  braggingComments, type BraggingComment, type InsertBraggingComment,
  braggingLikes,
  musicTracks, type MusicTrack, type InsertMusicTrack,
  threads, type Thread, type InsertThread,
  threadReplies, type ThreadReply, type InsertThreadReply,
  advertisers, type Advertiser, type InsertAdvertiser,
  prizePoolContributions,
  payouts, type Payout,
  referrals, type Referral,
  merchOrders, type MerchOrder, type InsertMerchOrder,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByStripeCustomerId(customerId: string): Promise<User | null>;
  getUserByPaypalSubscriptionId(subscriptionId: string): Promise<User | null>;
  updateUser(id: string, data: Partial<User>): Promise<User | null>;

  getGames(league?: string): Promise<Game[]>;
  getGame(id: number): Promise<Game | null>;
  createGame(game: InsertGame): Promise<Game>;

  createPrediction(prediction: InsertPrediction): Promise<Prediction>;
  getUserPredictions(userId: string): Promise<Prediction[]>;
  getPrediction(id: number): Promise<Prediction | null>;
  updatePrediction(id: number, data: Partial<Prediction>): Promise<Prediction | null>;

  getChatMessages(channel: string, limit?: number): Promise<(ChatMessage & { user: User | null })[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  createTransaction(tx: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;

  getLeaderboard(period: string, limit?: number): Promise<(LeaderboardEntry & { user: User | null })[]>;
  getLeaderboardByLeague(period: string, league: string, limit?: number): Promise<any[]>;
  getUserStats(userId: string): Promise<{ wins: number; losses: number; profit: number; roi: number; streak: number }>;

  getBraggingPosts(limit?: number, offset?: number): Promise<(BraggingPost & { user: User | null; commentCount: number })[]>;
  createBraggingPost(post: InsertBraggingPost): Promise<BraggingPost>;
  deleteBraggingPost(id: number, userId: string): Promise<boolean>;
  getBraggingComments(postId: number): Promise<(BraggingComment & { user: User | null })[]>;
  createBraggingComment(comment: InsertBraggingComment): Promise<BraggingComment>;
  toggleBraggingLike(postId: number, userId: string): Promise<{ liked: boolean; likes: number }>;
  getUserLikedPosts(userId: string): Promise<number[]>;

  getMemberLocations(): Promise<Pick<User, "id" | "firstName" | "lastName" | "profileImageUrl" | "membershipTier" | "city" | "state" | "country" | "latitude" | "longitude">[]>;

  getThreads(category?: string): Promise<(Thread & { user: User | null })[]>;
  getThreadsByUser(userId: string): Promise<(Thread & { user: User | null })[]>;
  getThreadsByProfile(profileUserId: string): Promise<(Thread & { user: User | null })[]>;
  getThread(id: number): Promise<(Thread & { user: User | null }) | null>;
  createThread(thread: InsertThread): Promise<Thread>;
  getThreadReplies(threadId: number): Promise<(ThreadReply & { user: User | null })[]>;
  createThreadReply(reply: InsertThreadReply): Promise<ThreadReply>;

  getMusicTracks(date?: string): Promise<MusicTrack[]>;
  createMusicTrack(track: InsertMusicTrack): Promise<MusicTrack>;
  updateMusicTrack(id: number, data: Partial<MusicTrack>): Promise<MusicTrack | null>;
  deleteMusicTrack(id: number): Promise<boolean>;

  getActiveAdvertisers(placement?: string): Promise<Advertiser[]>;
  getAllAdvertisers(): Promise<Advertiser[]>;
  createAdvertiser(ad: InsertAdvertiser): Promise<Advertiser>;
  updateAdvertiser(id: number, data: Partial<Advertiser>): Promise<Advertiser | null>;
  deleteAdvertiser(id: number): Promise<boolean>;
  incrementAdImpression(id: number): Promise<void>;
  incrementAdClick(id: number): Promise<void>;

  addPrizePoolContribution(amount: number, source: string, stripePaymentId?: string, userId?: string): Promise<void>;
  getPrizePoolTotal(): Promise<number>;
  getPrizePoolTotalByPeriod(periodStart: Date): Promise<number>;

  createPayout(data: { userId: string; amount: number; period: string; periodLabel: string; rank: number; sharePercent: number }): Promise<Payout>;
  updatePayout(id: number, data: Partial<Payout>): Promise<Payout | null>;
  getPayoutsByPeriod(period: string, periodLabel: string): Promise<(Payout & { user: User | null })[]>;
  getUserPayouts(userId: string): Promise<Payout[]>;
  getAllPayouts(limit?: number): Promise<(Payout & { user: User | null })[]>;

  getMemberCount(): Promise<number>;
  getProduct(productId: string): Promise<any>;
  getSubscription(subscriptionId: string): Promise<any>;
  listProductsWithPrices(): Promise<any[]>;

  generateReferralCode(userId: string): Promise<string>;
  getUserByReferralCode(code: string): Promise<User | null>;
  createReferral(referrerId: string, referredId: string): Promise<Referral>;
  getReferralsByReferrer(referrerId: string): Promise<(Referral & { referred: User | null })[]>;
  completeReferralPrediction(referredId: string): Promise<void>;
  getReferralStats(userId: string): Promise<{ totalReferred: number; signupBonuses: number; predictionBonuses: number; totalEarned: number; pendingCount: number; completedCount: number; monthlyIncome: number; instantBonus: number }>;

  createMerchOrder(order: InsertMerchOrder): Promise<MerchOrder>;
  getMerchOrder(id: number): Promise<MerchOrder | null>;
  getMerchOrderByCheckoutSession(sessionId: string): Promise<MerchOrder | null>;
  getUserMerchOrders(userId: string): Promise<MerchOrder[]>;
  getAllMerchOrders(): Promise<(MerchOrder & { user: User | null })[]>;
  updateMerchOrder(id: number, data: Partial<MerchOrder>): Promise<MerchOrder | null>;
  getMerchProfitStats(): Promise<{
    totalRevenue: number; totalWholesale: number; totalProfit: number;
    totalShipping: number; profitMarginPercent: number;
    totalOrders: number; pendingFulfillment: number;
    byProduct: Record<string, { name: string; unitsSold: number; revenue: number; wholesale: number; profit: number; marginPercent: number }>;
    byMonth: { month: string; revenue: number; wholesale: number; profit: number; orders: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
    return user || null;
  }

  async getUserByPaypalSubscriptionId(subscriptionId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.paypalSubscriptionId, subscriptionId));
    return user || null;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user || null;
  }

  async getGames(league?: string): Promise<Game[]> {
    if (league && league !== "ALL") {
      return db.select().from(games).where(eq(games.league, league)).orderBy(asc(games.gameTime));
    }
    return db.select().from(games).orderBy(asc(games.gameTime));
  }

  async getGame(id: number): Promise<Game | null> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game || null;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const [created] = await db.insert(games).values(game).returning();
    return created;
  }

  async createPrediction(prediction: InsertPrediction): Promise<Prediction> {
    const [created] = await db.insert(predictions).values(prediction).returning();
    return created;
  }

  async getUserPredictions(userId: string): Promise<Prediction[]> {
    return db.select().from(predictions).where(eq(predictions.userId, userId)).orderBy(desc(predictions.createdAt));
  }

  async getPrediction(id: number): Promise<Prediction | null> {
    const [p] = await db.select().from(predictions).where(eq(predictions.id, id));
    return p || null;
  }

  async updatePrediction(id: number, data: Partial<Prediction>): Promise<Prediction | null> {
    const [p] = await db.update(predictions).set(data).where(eq(predictions.id, id)).returning();
    return p || null;
  }

  async getChatMessages(channel: string, limit = 50): Promise<(ChatMessage & { user: User | null })[]> {
    const msgs = await db
      .select()
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(eq(chatMessages.channel, channel))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    return msgs.map((m) => ({
      ...m.chat_messages,
      user: m.users,
    }));
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [created] = await db.insert(chatMessages).values(message).returning();
    return created;
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(tx).returning();
    return created;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
  }

  async getLeaderboard(period: string, limit = 50): Promise<(LeaderboardEntry & { user: User | null })[]> {
    const entries = await db
      .select()
      .from(leaderboardEntries)
      .leftJoin(users, eq(leaderboardEntries.userId, users.id))
      .where(eq(leaderboardEntries.period, period))
      .orderBy(desc(leaderboardEntries.roi))
      .limit(limit);

    return entries.map((e) => ({
      ...e.leaderboard_entries,
      user: e.users,
    }));
  }

  async getLeaderboardByLeague(period: string, league: string, limit = 50): Promise<any[]> {
    const leagueGames = await db.select().from(games).where(eq(games.league, league));
    const leagueGameIds = new Set(leagueGames.map((g) => g.id));
    if (leagueGameIds.size === 0) return [];

    const now = new Date();
    let periodStart: Date;
    if (period === "daily") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "weekly") {
      const day = now.getDay();
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else if (period === "monthly") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      periodStart = new Date(now.getFullYear(), 0, 1);
    }

    const allPreds = await db.select().from(predictions);
    const filtered = allPreds.filter((p) =>
      leagueGameIds.has(p.gameId) && new Date(p.createdAt!) >= periodStart
    );

    const byUser: Record<string, typeof filtered> = {};
    for (const p of filtered) {
      if (!byUser[p.userId]) byUser[p.userId] = [];
      byUser[p.userId].push(p);
    }

    const entries = Object.entries(byUser).map(([userId, preds]) => {
      const wins = preds.filter((p) => p.result === "win").length;
      const losses = preds.filter((p) => p.result === "loss").length;
      const profit = preds.reduce((acc, p) => acc + (p.payout || 0), 0);
      const total = wins + losses;
      const roi = total > 0 ? (profit / total) * 100 : 0;

      let streak = 0;
      const sorted = [...preds].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      for (const p of sorted) {
        if (p.result === "win") streak++;
        else break;
      }

      return { userId, wins, losses, profit: Math.round(profit * 100) / 100, roi: Math.round(roi * 100) / 100, streak };
    });

    entries.sort((a, b) => b.roi - a.roi);
    const topEntries = entries.slice(0, limit);

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    return topEntries.map((e, i) => ({
      id: i + 1,
      userId: e.userId,
      period,
      periodStart,
      rank: i + 1,
      wins: e.wins,
      losses: e.losses,
      roi: e.roi,
      profit: e.profit,
      streak: e.streak,
      updatedAt: new Date(),
      user: userMap.get(e.userId) || null,
    }));
  }

  async getUserStats(userId: string): Promise<{ wins: number; losses: number; profit: number; roi: number; streak: number }> {
    const userPreds = await db.select().from(predictions).where(eq(predictions.userId, userId));
    const wins = userPreds.filter((p) => p.result === "win").length;
    const losses = userPreds.filter((p) => p.result === "loss").length;
    const profit = userPreds.reduce((acc, p) => acc + (p.payout || 0), 0);
    const total = wins + losses;
    const roi = total > 0 ? (profit / total) * 100 : 0;

    let streak = 0;
    const sorted = userPreds.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    for (const p of sorted) {
      if (p.result === "win") streak++;
      else break;
    }

    return { wins, losses, profit, roi, streak };
  }

  async getBraggingPosts(limit = 50, offset = 0): Promise<(BraggingPost & { user: User | null; commentCount: number })[]> {
    const posts = await db
      .select()
      .from(braggingPosts)
      .leftJoin(users, eq(braggingPosts.userId, users.id))
      .orderBy(desc(braggingPosts.createdAt))
      .limit(limit)
      .offset(offset);

    const postIds = posts.map(p => p.bragging_posts.id);
    let commentCounts: Record<number, number> = {};
    if (postIds.length > 0) {
      const counts = await db.execute(
        sql`SELECT post_id, COUNT(*)::int as count FROM bragging_comments WHERE post_id = ANY(${postIds}) GROUP BY post_id`
      );
      for (const row of counts.rows as any[]) {
        commentCounts[row.post_id] = row.count;
      }
    }

    return posts.map((p) => ({
      ...p.bragging_posts,
      user: p.users,
      commentCount: commentCounts[p.bragging_posts.id] || 0,
    }));
  }

  async createBraggingPost(post: InsertBraggingPost): Promise<BraggingPost> {
    const [created] = await db.insert(braggingPosts).values(post).returning();
    return created;
  }

  async deleteBraggingPost(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(braggingPosts).where(and(eq(braggingPosts.id, id), eq(braggingPosts.userId, userId))).returning();
    return result.length > 0;
  }

  async getBraggingComments(postId: number): Promise<(BraggingComment & { user: User | null })[]> {
    const comments = await db
      .select()
      .from(braggingComments)
      .leftJoin(users, eq(braggingComments.userId, users.id))
      .where(eq(braggingComments.postId, postId))
      .orderBy(asc(braggingComments.createdAt));

    return comments.map((c) => ({
      ...c.bragging_comments,
      user: c.users,
    }));
  }

  async createBraggingComment(comment: InsertBraggingComment): Promise<BraggingComment> {
    const [created] = await db.insert(braggingComments).values(comment).returning();
    return created;
  }

  async toggleBraggingLike(postId: number, userId: string): Promise<{ liked: boolean; likes: number }> {
    const existing = await db
      .select()
      .from(braggingLikes)
      .where(and(eq(braggingLikes.postId, postId), eq(braggingLikes.userId, userId)));

    if (existing.length > 0) {
      await db.delete(braggingLikes).where(and(eq(braggingLikes.postId, postId), eq(braggingLikes.userId, userId)));
      await db.update(braggingPosts).set({ likes: sql`GREATEST(${braggingPosts.likes} - 1, 0)` }).where(eq(braggingPosts.id, postId));
      const [post] = await db.select({ likes: braggingPosts.likes }).from(braggingPosts).where(eq(braggingPosts.id, postId));
      return { liked: false, likes: post?.likes || 0 };
    } else {
      await db.insert(braggingLikes).values({ postId, userId });
      await db.update(braggingPosts).set({ likes: sql`${braggingPosts.likes} + 1` }).where(eq(braggingPosts.id, postId));
      const [post] = await db.select({ likes: braggingPosts.likes }).from(braggingPosts).where(eq(braggingPosts.id, postId));
      return { liked: true, likes: post?.likes || 0 };
    }
  }

  async getUserLikedPosts(userId: string): Promise<number[]> {
    const likes = await db.select({ postId: braggingLikes.postId }).from(braggingLikes).where(eq(braggingLikes.userId, userId));
    return likes.map(l => l.postId);
  }

  async getMemberLocations(): Promise<Pick<User, "id" | "firstName" | "lastName" | "profileImageUrl" | "membershipTier" | "city" | "state" | "country" | "latitude" | "longitude">[]> {
    return db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        membershipTier: users.membershipTier,
        city: users.city,
        state: users.state,
        country: users.country,
        latitude: users.latitude,
        longitude: users.longitude,
      })
      .from(users)
      .where(sql`${users.latitude} IS NOT NULL AND ${users.longitude} IS NOT NULL`);
  }

  async getThreads(category?: string): Promise<(Thread & { user: User | null })[]> {
    const query = db
      .select()
      .from(threads)
      .leftJoin(users, eq(threads.userId, users.id))
      .orderBy(desc(threads.pinned), desc(threads.lastReplyAt))
      .limit(50);

    const results = category && category !== "all"
      ? await db.select().from(threads).leftJoin(users, eq(threads.userId, users.id))
          .where(eq(threads.category, category))
          .orderBy(desc(threads.pinned), desc(threads.lastReplyAt)).limit(50)
      : await query;

    return results.map((r) => ({ ...r.threads, user: r.users }));
  }

  async getThreadsByUser(userId: string): Promise<(Thread & { user: User | null })[]> {
    const results = await db.select().from(threads)
      .leftJoin(users, eq(threads.userId, users.id))
      .where(eq(threads.userId, userId))
      .orderBy(desc(threads.lastReplyAt))
      .limit(50);
    return results.map((r) => ({ ...r.threads, user: r.users }));
  }

  async getThreadsByProfile(profileUserId: string): Promise<(Thread & { user: User | null })[]> {
    const results = await db.select().from(threads)
      .leftJoin(users, eq(threads.userId, users.id))
      .where(eq(threads.profileUserId, profileUserId))
      .orderBy(desc(threads.pinned), desc(threads.lastReplyAt))
      .limit(50);
    return results.map((r) => ({ ...r.threads, user: r.users }));
  }

  async getThread(id: number): Promise<(Thread & { user: User | null }) | null> {
    const results = await db.select().from(threads)
      .leftJoin(users, eq(threads.userId, users.id))
      .where(eq(threads.id, id))
      .limit(1);
    if (results.length === 0) return null;
    return { ...results[0].threads, user: results[0].users };
  }

  async createThread(thread: InsertThread): Promise<Thread> {
    const [created] = await db.insert(threads).values(thread).returning();
    return created;
  }

  async getThreadReplies(threadId: number): Promise<(ThreadReply & { user: User | null })[]> {
    const results = await db.select().from(threadReplies)
      .leftJoin(users, eq(threadReplies.userId, users.id))
      .where(eq(threadReplies.threadId, threadId))
      .orderBy(asc(threadReplies.createdAt));
    return results.map((r) => ({ ...r.thread_replies, user: r.users }));
  }

  async createThreadReply(reply: InsertThreadReply): Promise<ThreadReply> {
    const [created] = await db.insert(threadReplies).values(reply).returning();
    await db.update(threads).set({
      replyCount: sql`${threads.replyCount} + 1`,
      lastReplyAt: new Date(),
    }).where(eq(threads.id, reply.threadId));
    return created;
  }

  async getMusicTracks(date?: string): Promise<MusicTrack[]> {
    if (date) {
      return db.select().from(musicTracks)
        .where(and(eq(musicTracks.active, true), eq(musicTracks.scheduleDate, date)))
        .orderBy(asc(musicTracks.sortOrder));
    }
    return db.select().from(musicTracks)
      .where(eq(musicTracks.active, true))
      .orderBy(asc(musicTracks.sortOrder));
  }

  async createMusicTrack(track: InsertMusicTrack): Promise<MusicTrack> {
    const [created] = await db.insert(musicTracks).values(track).returning();
    return created;
  }

  async updateMusicTrack(id: number, data: Partial<MusicTrack>): Promise<MusicTrack | null> {
    const [updated] = await db.update(musicTracks).set(data).where(eq(musicTracks.id, id)).returning();
    return updated || null;
  }

  async deleteMusicTrack(id: number): Promise<boolean> {
    const result = await db.delete(musicTracks).where(eq(musicTracks.id, id)).returning();
    return result.length > 0;
  }

  async getActiveAdvertisers(placement?: string): Promise<Advertiser[]> {
    if (placement) {
      return db.select().from(advertisers)
        .where(and(eq(advertisers.active, true), eq(advertisers.placement, placement)))
        .orderBy(asc(advertisers.createdAt));
    }
    return db.select().from(advertisers)
      .where(eq(advertisers.active, true))
      .orderBy(asc(advertisers.createdAt));
  }

  async getAllAdvertisers(): Promise<Advertiser[]> {
    return db.select().from(advertisers).orderBy(desc(advertisers.createdAt));
  }

  async createAdvertiser(ad: InsertAdvertiser): Promise<Advertiser> {
    const [created] = await db.insert(advertisers).values(ad).returning();
    return created;
  }

  async updateAdvertiser(id: number, data: Partial<Advertiser>): Promise<Advertiser | null> {
    const [updated] = await db.update(advertisers).set(data).where(eq(advertisers.id, id)).returning();
    return updated || null;
  }

  async deleteAdvertiser(id: number): Promise<boolean> {
    const result = await db.delete(advertisers).where(eq(advertisers.id, id)).returning();
    return result.length > 0;
  }

  async incrementAdImpression(id: number): Promise<void> {
    await db.update(advertisers).set({ impressions: sql`${advertisers.impressions} + 1` }).where(eq(advertisers.id, id));
  }

  async incrementAdClick(id: number): Promise<void> {
    await db.update(advertisers).set({ clicks: sql`${advertisers.clicks} + 1` }).where(eq(advertisers.id, id));
  }

  async getProduct(productId: string): Promise<any> {
    try {
      const result = await db.execute(sql`SELECT * FROM stripe.products WHERE id = ${productId}`);
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    try {
      const result = await db.execute(sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`);
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  async createPayout(data: { userId: string; amount: number; period: string; periodLabel: string; rank: number; sharePercent: number }): Promise<Payout> {
    const [payout] = await db.insert(payouts).values(data).returning();
    return payout;
  }

  async updatePayout(id: number, data: Partial<Payout>): Promise<Payout | null> {
    const [payout] = await db.update(payouts).set(data).where(eq(payouts.id, id)).returning();
    return payout || null;
  }

  async getPayoutsByPeriod(period: string, periodLabel: string): Promise<(Payout & { user: User | null })[]> {
    const results = await db.select().from(payouts)
      .leftJoin(users, eq(payouts.userId, users.id))
      .where(and(eq(payouts.period, period), eq(payouts.periodLabel, periodLabel)))
      .orderBy(asc(payouts.rank));
    return results.map(r => ({ ...r.payouts, user: r.users }));
  }

  async getUserPayouts(userId: string): Promise<Payout[]> {
    return db.select().from(payouts).where(eq(payouts.userId, userId)).orderBy(desc(payouts.createdAt));
  }

  async getAllPayouts(limit = 50): Promise<(Payout & { user: User | null })[]> {
    const results = await db.select().from(payouts)
      .leftJoin(users, eq(payouts.userId, users.id))
      .orderBy(desc(payouts.createdAt))
      .limit(limit);
    return results.map(r => ({ ...r.payouts, user: r.users }));
  }

  async addPrizePoolContribution(amount: number, source: string, stripePaymentId?: string, userId?: string): Promise<void> {
    await db.insert(prizePoolContributions).values({
      amount,
      source,
      stripePaymentId: stripePaymentId || null,
      userId: userId || null,
    });
  }

  async getPrizePoolTotal(): Promise<number> {
    const [result] = await db.select({
      total: sql<number>`COALESCE(SUM(${prizePoolContributions.amount}), 0)`,
    }).from(prizePoolContributions);
    return Number(result?.total || 0);
  }

  async getPrizePoolTotalByPeriod(periodStart: Date): Promise<number> {
    const [result] = await db.select({
      total: sql<number>`COALESCE(SUM(${prizePoolContributions.amount}), 0)`,
    }).from(prizePoolContributions).where(
      sql`${prizePoolContributions.createdAt} >= ${periodStart}`
    );
    return Number(result?.total || 0);
  }

  async getMemberCount(): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM users WHERE stripe_subscription_id IS NOT NULL
      `);
      return Number(result.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async listProductsWithPrices(): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = true
          ORDER BY id
          LIMIT 20
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `);
      return result.rows;
    } catch {
      return [];
    }
  }
  async generateReferralCode(userId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (user?.referralCode) return user.referralCode;

    const base = (user?.firstName || user?.phone?.slice(-4) || "FAN")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    const suffix = Math.floor(100 + Math.random() * 900).toString();
    let code = base + suffix;

    const existing = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
    if (existing.length > 0) {
      code = base + Math.floor(100 + Math.random() * 900).toString();
    }

    await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
    return code;
  }

  async getUserByReferralCode(code: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user || null;
  }

  async createReferral(referrerId: string, referredId: string): Promise<Referral> {
    const [referral] = await db.insert(referrals).values({
      referrerId,
      referredId,
      status: "active",
      signupBonus: 0,
      predictionBonus: 0,
    }).returning();

    return referral;
  }

  async getReferralsByReferrer(referrerId: string): Promise<(Referral & { referred: User | null })[]> {
    const refs = await db.select().from(referrals)
      .leftJoin(users, eq(referrals.referredId, users.id))
      .where(eq(referrals.referrerId, referrerId))
      .orderBy(desc(referrals.createdAt));

    return refs.map((r) => ({
      ...r.referrals,
      referred: r.users,
    }));
  }

  async completeReferralPrediction(referredId: string): Promise<void> {
  }

  async getReferralStats(userId: string): Promise<{ totalReferred: number; signupBonuses: number; predictionBonuses: number; totalEarned: number; pendingCount: number; completedCount: number; monthlyIncome: number; instantBonus: number }> {
    const FOUNDER_CODES = ["NIKCOX", "DAMON822"];
    const LAPSE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = new Date();

    const refs = await db.select().from(referrals).where(eq(referrals.referrerId, userId));
    const totalReferred = refs.length;
    const activeRefs = refs.filter((r) => r.status === "active");
    const activeCount = activeRefs.length;
    const pendingCount = refs.filter((r) => r.status === "pending").length;

    const referrer = await this.getUser(userId);
    const isFounder = FOUNDER_CODES.includes(referrer?.referralCode ?? "");
    const referrerIsLegend = referrer?.membershipTier === "legend";

    // Non-founders who cancelled 30+ days ago lose all residual income
    const cancelledAt = referrer?.subscriptionCancelledAt ? new Date(referrer.subscriptionCancelledAt) : null;
    const isLapsed = !isFounder &&
      referrer?.membershipTier === "free" &&
      cancelledAt !== null &&
      (now.getTime() - cancelledAt.getTime()) > LAPSE_MS;

    let monthlyIncome = 0;

    if (!isLapsed) {
      for (const ref of activeRefs) {
        const referred = await this.getUser(ref.referredId);
        const referredIsLegend = referred?.membershipTier === "legend";
        if (referrerIsLegend || isFounder || referredIsLegend) {
          monthlyIncome += 50;
        } else {
          monthlyIncome += 1;
        }
      }
    }

    // Founder also earns income redirected from lapsed affiliates
    if (isFounder) {
      const allActiveReferrals = await db.select().from(referrals).where(eq(referrals.status, "active"));
      for (const ref of allActiveReferrals) {
        if (ref.referrerId === userId) continue; // already counted above
        const affiliateReferrer = await this.getUser(ref.referrerId);
        if (!affiliateReferrer) continue;
        if (FOUNDER_CODES.includes(affiliateReferrer.referralCode ?? "")) continue;
        const affCancelledAt = affiliateReferrer.subscriptionCancelledAt
          ? new Date(affiliateReferrer.subscriptionCancelledAt)
          : null;
        const affiliateLapsed = affiliateReferrer.membershipTier === "free" &&
          affCancelledAt !== null &&
          (now.getTime() - affCancelledAt.getTime()) > LAPSE_MS;
        if (affiliateLapsed) {
          monthlyIncome += 50; // lapsed affiliate's earnings redirect to founder
        }
      }
    }

    const txs = await this.getUserTransactions(userId);
    const instantBonus = txs
      .filter((tx) => tx.type === "referral_bonus" && tx.status === "completed")
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);

    return { totalReferred, signupBonuses: 0, predictionBonuses: 0, totalEarned: monthlyIncome + instantBonus, pendingCount, completedCount: activeCount, monthlyIncome, instantBonus };
  }

  async createMerchOrder(order: InsertMerchOrder): Promise<MerchOrder> {
    const [created] = await db.insert(merchOrders).values(order).returning();
    return created;
  }

  async getMerchOrder(id: number): Promise<MerchOrder | null> {
    const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, id));
    return order || null;
  }

  async getMerchOrderByCheckoutSession(sessionId: string): Promise<MerchOrder | null> {
    const [order] = await db.select().from(merchOrders).where(eq(merchOrders.stripeCheckoutSessionId, sessionId));
    return order || null;
  }

  async getUserMerchOrders(userId: string): Promise<MerchOrder[]> {
    return await db.select().from(merchOrders).where(eq(merchOrders.userId, userId)).orderBy(desc(merchOrders.createdAt));
  }

  async getAllMerchOrders(): Promise<(MerchOrder & { user: User | null })[]> {
    const orders = await db.select().from(merchOrders)
      .leftJoin(users, eq(merchOrders.userId, users.id))
      .orderBy(desc(merchOrders.createdAt));
    return orders.map((o) => ({ ...o.merch_orders, user: o.users }));
  }

  async updateMerchOrder(id: number, data: Partial<MerchOrder>): Promise<MerchOrder | null> {
    const [updated] = await db.update(merchOrders).set({ ...data, updatedAt: new Date() }).where(eq(merchOrders.id, id)).returning();
    return updated || null;
  }

  async getMerchProfitStats(): Promise<{
    totalRevenue: number; totalWholesale: number; totalProfit: number;
    totalShipping: number; profitMarginPercent: number;
    totalOrders: number; pendingFulfillment: number;
    byProduct: Record<string, { name: string; unitsSold: number; revenue: number; wholesale: number; profit: number; marginPercent: number }>;
    byMonth: { month: string; revenue: number; wholesale: number; profit: number; orders: number }[];
  }> {
    const orders = await db.select().from(merchOrders).where(eq(merchOrders.status, "paid"));
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalCharged, 0);
    const totalWholesale = orders.reduce((sum, o) => sum + o.wholesaleCost, 0);
    const totalProfit = orders.reduce((sum, o) => sum + o.platformProfit, 0);
    const totalShipping = orders.reduce((sum, o) => sum + (o.shippingCost || 0), 0);
    const pendingFulfillment = orders.filter((o) => o.fulfillmentStatus === "unfulfilled").length;
    const profitMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const byProduct: Record<string, { name: string; unitsSold: number; revenue: number; wholesale: number; profit: number; marginPercent: number }> = {};
    const byMonthMap: Record<string, { revenue: number; wholesale: number; profit: number; orders: number }> = {};

    for (const order of orders) {
      try {
        const items = JSON.parse(order.items);
        for (const item of items) {
          const key = item.id || item.name;
          if (!byProduct[key]) {
            byProduct[key] = { name: item.name || key, unitsSold: 0, revenue: 0, wholesale: 0, profit: 0, marginPercent: 0 };
          }
          const qty = item.quantity || 1;
          const rev = (item.retailPrice || 0) * qty;
          const ws = (item.wholesalePrice || 0) * qty;
          byProduct[key].unitsSold += qty;
          byProduct[key].revenue += rev;
          byProduct[key].wholesale += ws;
          byProduct[key].profit += rev - ws;
        }
      } catch {}

      const monthKey = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 7) : "unknown";
      if (!byMonthMap[monthKey]) byMonthMap[monthKey] = { revenue: 0, wholesale: 0, profit: 0, orders: 0 };
      byMonthMap[monthKey].revenue += order.totalCharged;
      byMonthMap[monthKey].wholesale += order.wholesaleCost;
      byMonthMap[monthKey].profit += order.platformProfit;
      byMonthMap[monthKey].orders += 1;
    }

    for (const key in byProduct) {
      byProduct[key].marginPercent = byProduct[key].revenue > 0
        ? Math.round((byProduct[key].profit / byProduct[key].revenue) * 10000) / 100
        : 0;
    }

    const byMonth = Object.entries(byMonthMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalWholesale: Math.round(totalWholesale * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalShipping: Math.round(totalShipping * 100) / 100,
      profitMarginPercent: Math.round(profitMarginPercent * 100) / 100,
      totalOrders: orders.length,
      pendingFulfillment,
      byProduct,
      byMonth,
    };
  }
}

export const storage = new DatabaseStorage();
