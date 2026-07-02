import { Rocket } from "lucide-react";

type RocketLaunchEffectProps = {
  effectKey: number;
};

export function RocketLaunchEffect({ effectKey }: RocketLaunchEffectProps) {
  return (
    <div key={effectKey} className="rocket-launch-effect" aria-hidden="true">
      <div className="rocket-launch-effect__sky">
        <span className="rocket-launch-effect__star star-one" />
        <span className="rocket-launch-effect__star star-two" />
        <span className="rocket-launch-effect__star star-three" />
      </div>
      <div className="rocket-launch-effect__rocket">
        <Rocket size={58} strokeWidth={2.2} />
      </div>
      <div className="rocket-launch-effect__flame" />
      <div className="rocket-launch-effect__smoke smoke-one" />
      <div className="rocket-launch-effect__smoke smoke-two" />
      <div className="rocket-launch-effect__smoke smoke-three" />
    </div>
  );
}
