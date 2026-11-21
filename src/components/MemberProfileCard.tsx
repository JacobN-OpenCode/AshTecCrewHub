import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMemberProfile, type GetMemberProfileOutputType } from '#api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { EyeOff, GraduationCap, HandHeart, Mail, Shield, Wrench } from 'lucide-react';
import MemberAvatar from './MemberAvatar';

type Profile = GetMemberProfileOutputType;

/**
 * The click-a-person card (feedback round 2). Any crew member can open it; the
 * server decides what they are allowed to see, and a withheld field says so
 * rather than looking broken.
 */
export default function MemberProfileCard({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const [data, setData] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    let live = true;
    setData(null);
    setFailed(false);
    getMemberProfile({ memberId })
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [memberId]);

  const m = data?.member;

  return (
    <Dialog open={!!memberId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {failed && <p className="text-sm text-muted-foreground">That profile could not be loaded.</p>}
        {!failed && !m && (
          <div className="space-y-4">
            <DialogHeader><DialogTitle className="sr-only">Crew member</DialogTitle></DialogHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div>
            </div>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        )}
        {m && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <MemberAvatar url={m.avatarUrl} firstName={m.firstName} lastName={m.lastName} size="lg" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    {m.firstName} {m.lastName}
                    {m.isAdmin && <Shield className="h-4 w-4 text-primary" />}
                    {m.isMaintainer && <Wrench className="h-4 w-4 text-primary" />}
                    {m.isStaff && <Badge variant="outline">Staff</Badge>}
                    <Badge variant="outline">{m.memberType}</Badge>
                    {m.year && <span className="text-sm font-normal text-muted-foreground">{m.year}</span>}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">@{m.shortUsername}</p>
                  {(m.statusEmoji || m.statusText) && (
                    <p className="mt-0.5 text-sm">{m.statusEmoji} {m.statusText}</p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {m.email ? (
                <a href={`mailto:${m.email}`} className="flex items-center gap-2 text-sm hover:underline">
                  <Mail className="h-4 w-4 text-primary" /> {m.email}
                </a>
              ) : (
                data?.hidden.email && <p className="flex items-center gap-2 text-sm text-muted-foreground"><EyeOff className="h-4 w-4" /> Email hidden by this member</p>
              )}

              {(m.roles.length > 0 || m.headOf.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {m.headOf.map((r) => <Badge key={`h-${r}`} className="bg-primary/20 text-primary border-primary/30" variant="outline">Head of {r}</Badge>)}
                  {m.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                </div>
              )}

              {data?.hidden.skills ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><EyeOff className="h-4 w-4" /> Skills hidden by this member</p>
              ) : (
                <>
                  {m.skillsTeach.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                        <GraduationCap className="h-3 w-3" /> Can teach
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.skillsTeach.map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
                      </div>
                    </div>
                  )}
                  {m.skillsLearn.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <HandHeart className="h-3 w-3" /> Wants to learn
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.skillsLearn.map((s) => <Badge key={s} variant="outline" className="font-normal text-muted-foreground">{s}</Badge>)}
                      </div>
                    </div>
                  )}
                  {m.skillsTeach.length === 0 && m.skillsLearn.length === 0 && (
                    <p className="text-sm text-muted-foreground">No skills tagged yet.</p>
                  )}
                </>
              )}

              {data?.isSelf && (
                <p className="text-xs text-muted-foreground">
                  This is you. <Link to="/profile" className="text-primary hover:underline">Edit your details</Link>
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
