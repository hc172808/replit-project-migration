import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section, EndpointList } from "@/components/miner/parts";
import { ASSETS, MINERS, assetFor } from "@/lib/assets";
import {
  addEndpoint, createProfile, deleteEndpoint, deleteProfile, endpointsQuery, profilesQuery, updateEndpoint,
  updateProfile, type MiningProfile,
} from "@/lib/miner-data";
import { testRpcEndpoints } from "@/lib/miner-rpc.functions";

export const Route = createFileRoute("/_authenticated/dashboard/profiles")({
  head: () => ({
    meta: [
      { title: "Coins & pools — GYDS Miner" },
      { name: "description", content: "Set up which coins your rigs mine: pool, wallet, algorithm and mining program." },
      { property: "og:title", content: "Coins & pools — GYDS Miner" },
      { property: "og:description", content: "Set up which coins your rigs mine: pool, wallet, algorithm and mining program." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profiles,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function Profiles() {
  const qc = useQueryClient();
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const [newCoin, setNewCoin] = useState("XMR");
  const refresh = () => qc.invalidateQueries({ queryKey: profilesQuery.queryKey });

  async function add() {
    const a = assetFor(newCoin);
    try {
      await createProfile({
        name: a.name, coin: a.coin, algorithm: a.algorithm, miner: a.miners[0]!, device: a.devices[0]!,
        pool_url: a.protocol === "stratum" ? a.poolExample : "", wallet_address: "", worker_name: "",
        pool_password: "x", mining_mode: "pool", extra_args: "",
      });
      await refresh();
      toast.success(`${a.name} profile added`);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Section title="Add a coin">
        <div className="flex gap-2">
          <select aria-label="Coin" className={selectCls} value={newCoin} onChange={(e) => setNewCoin(e.target.value)}>
            {ASSETS.map((a) => <option key={a.coin} value={a.coin}>{a.name}</option>)}
          </select>
          <Button onClick={add}><Plus /> Add</Button>
        </div>
      </Section>
      {profiles.map((p) => <ProfileCard key={p.id + p.coin} profile={p} onChanged={refresh} />)}
    </div>
  );
}

function ProfileCard({ profile, onChanged }: { profile: MiningProfile; onChanged: () => void }) {
  const qc = useQueryClient();
  const testFn = useServerFn(testRpcEndpoints);
  const asset = assetFor(profile.coin);
  const [f, setF] = useState(profile);
  const isRpc = asset.protocol === "gyds-rpc";
  const { data: endpoints } = useQuery({ ...endpointsQuery(profile.id), enabled: isRpc });
  const refreshEps = () => qc.invalidateQueries({ queryKey: endpointsQuery(profile.id).queryKey });
  const set = (k: keyof MiningProfile, v: string) => setF({ ...f, [k]: v } as MiningProfile);
  const text = (k: keyof MiningProfile, label: string, placeholder = "") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input className="font-mono" value={String(f[k] ?? "")} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Section
      title={`${profile.name} · ${profile.coin}`}
      right={
        <Button size="icon" variant="ghost" aria-label="Delete profile" onClick={async () => {
          if (!confirm(`Delete ${profile.name}?`)) return;
          try { await deleteProfile(profile.id); onChanged(); } catch (e) { toast.error((e as Error).message); }
        }}><Trash2 /></Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { id: _id, ...rest } = f;
            await updateProfile(profile.id, rest);
            onChanged();
            toast.success("Saved");
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", "Name")}
          {text("wallet_address", "Wallet address", asset.walletHint)}
          {!isRpc && text("pool_url", "Pool address", asset.poolExample)}
          {text("worker_name", "Worker name", "blank = rig name")}
          {!isRpc && text("algorithm", "Algorithm")}
          {!isRpc && text("pool_password", "Pool password")}
          {!isRpc && (
            <div className="space-y-1.5">
              <Label>Mining program</Label>
              <select className={selectCls} value={f.miner} onChange={(e) => set("miner", e.target.value)}>
                {asset.miners.map((m) => <option key={m} value={m}>{MINERS[m].name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Device</Label>
            <select className={selectCls} value={f.device} onChange={(e) => set("device", e.target.value)}>
              {asset.devices.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
            </select>
          </div>
          {isRpc && (
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <select className={selectCls} value={f.mining_mode} onChange={(e) => set("mining_mode", e.target.value)}>
                <option value="pool">Pool</option><option value="solo">Solo</option>
              </select>
            </div>
          )}
          {!isRpc && text("extra_args", "Extra program options")}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {asset.requirements.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <Button type="submit">Save</Button>
      </form>
      {isRpc && endpoints && (
        <div className="mt-5">
          <p className="eyebrow mb-2">Node endpoints</p>
          <EndpointList
            endpoints={endpoints}
            activeId={null}
            onAdd={async (d) => { try { await addEndpoint(profile.id, { ...d, position: endpoints.length }); await refreshEps(); } catch (e) { toast.error((e as Error).message); } }}
            onUpdate={async (id, d) => { try { await updateEndpoint(id, d); await refreshEps(); } catch (e) { toast.error((e as Error).message); } }}
            onDelete={async (id) => { try { await deleteEndpoint(id); await refreshEps(); } catch (e) { toast.error((e as Error).message); } }}
            onMove={async (idx, dir) => {
              const list = [...endpoints];
              const [moved] = list.splice(idx, 1);
              if (!moved) return;
              list.splice(idx + dir, 0, moved);
              await Promise.all(list.map((e, i) => (e.position === i ? null : updateEndpoint(e.id, { position: i }))));
              await refreshEps();
            }}
            onTest={async (id) => {
              try {
                const { results } = await testFn({ data: { profileId: profile.id, id } });
                for (const r of results) r.ok ? toast.success(`${r.label}: reachable (${r.latency} ms)`) : toast.error(`${r.label}: ${r.error}`);
              } catch (e) { toast.error((e as Error).message); }
            }}
          />
        </div>
      )}
    </Section>
  );
}
