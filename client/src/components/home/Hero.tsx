import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trophy, Target, Users, DollarSign, LogIn } from "lucide-react";
import heroBg from "@assets/generated_images/futuristic_sports_data_background.png";
import { HowToPlayBanner } from "@/components/HowToPlayPopup";
import { Link } from "wouter";

export function Hero() {
  return (
    <div className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="Background" 
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      </div>

      <div className="container mx-auto px-4 z-10 relative">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block py-1 px-3 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4 border border-primary/20 backdrop-blur-sm">
              The #1 Sports Prediction Platform
            </span>
            <HowToPlayBanner />
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
              Predict. Compete. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">Win. Earn.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed">
              Join the elite community of sports analysts. Track your stats, compete for daily prize pools, 
              and earn $1/month residual income for every member you refer.
            </p>
            <div className="inline-flex items-center gap-6 text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1.5"><Trophy size={14} className="text-primary" /> Daily Prize Pools</span>
              <span className="flex items-center gap-1.5"><Target size={14} className="text-blue-400" /> Spider AI Picks</span>
              <span className="flex items-center gap-1.5"><DollarSign size={14} className="text-green-400" /> Residual Income</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link href="/membership">
              <Button size="lg" className="h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                Start Predicting <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/auth">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-sm" data-testid="button-hero-login">
                <LogIn className="mr-2 w-5 h-5" /> Member Login
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-20 text-left"
          >
            {[
              { icon: Trophy, title: "Daily Rewards", desc: "Compete for daily cash prizes and the annual grand prize from the 50% winners pool." },
              { icon: Target, title: "Spider AI Picks", desc: "Access AI-powered predictions with confidence ratings across all major leagues." },
              { icon: Users, title: "Pro Community", desc: "Follow top predictors, post on member walls, and compete on the leaderboard." },
              { icon: DollarSign, title: "Affiliate Income", desc: "Earn $1/month for every member you refer — no caps, no limits, forever." },
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm hover:border-primary/30 transition-colors group">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                  <item.icon size={24} />
                </div>
                <h3 className="text-lg font-display font-bold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
