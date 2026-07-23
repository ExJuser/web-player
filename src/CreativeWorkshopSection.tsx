import { Images, ScanSearch, TreePine } from "lucide-react";

export type CreativeFeature = "mosaic" | "rings" | "echo";

type CreativeWorkshopSectionProps = {
  onOpenFeature: (feature: CreativeFeature) => void;
};

const features: Array<{
  id: CreativeFeature;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Images;
}> = [
  {
    id: "mosaic",
    eyebrow: "万千素材 · 聚成一幅",
    title: "千图成像",
    description: "让影片与图集中的细小画面共同组成一张新的作品，每个局部仍能回到原始素材。",
    icon: Images,
  },
  {
    id: "rings",
    eyebrow: "观看痕迹 · 长成森林",
    title: "影像年轮",
    description: "把每一次观看沉积成年轮，让时长、重看、完成和发射变成只属于你的影像森林。",
    icon: TreePine,
  },
  {
    id: "echo",
    eyebrow: "跨越影片 · 寻找押韵",
    title: "画面回声",
    description: "从当前画面出发，在媒体库里寻找构图、色彩与光影意外相似的另一个瞬间。",
    icon: ScanSearch,
  },
];

export function CreativeWorkshopSection({ onOpenFeature }: CreativeWorkshopSectionProps) {
  return (
    <section className="creative-workshop">
      <header className="creative-workshop-hero">
        <span>Creative cinema workshop</span>
        <h2>把私人片库变成创作材料</h2>
        <p>这里不是播放器的附属统计，而是一组会使用整座媒体库、生成意外结果的影像实验。</p>
      </header>
      <div className="creative-workshop-grid">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <button
              className={`creative-feature-card feature-${feature.id}`}
              key={feature.id}
              type="button"
              onClick={() => onOpenFeature(feature.id)}
            >
              <span className="creative-feature-number">0{index + 1}</span>
              <span className="creative-feature-visual"><Icon size={52} strokeWidth={1.35} /></span>
              <span className="creative-feature-copy">
                <small>{feature.eyebrow}</small>
                <strong>{feature.title}</strong>
                <span>{feature.description}</span>
              </span>
              <span className="creative-feature-enter">进入实验 →</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
