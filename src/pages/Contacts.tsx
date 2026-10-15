import { useEffect, useState } from 'react';
import { getContacts, type GetContactsOutputType } from '#api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Phone, Mail } from 'lucide-react';

type Contact = GetContactsOutputType['contacts'][number];

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await getContacts({});
        setContacts(r.contacts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contact sheet</h1>
          <p className="text-muted-foreground">Crew who have opted in to sharing their contact details.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="text-muted-foreground col-span-full">Loading…</p>}
        {!loading && contacts.length === 0 && <p className="text-muted-foreground col-span-full">Nobody has shared their contact details yet.</p>}
        {contacts.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-lg">{c.firstName} {c.lastName} {c.statusEmoji && <span>{c.statusEmoji}</span>}</CardTitle>
              <p className="text-sm text-muted-foreground">{c.memberType} · {c.year}</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.statusText && <p className="text-muted-foreground">{c.statusText}</p>}
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a>
              </div>
              {c.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <a className="hover:underline" href={`tel:${c.contactPhone}`}>{c.contactPhone}</a>
                </div>
              )}
              {c.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {c.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
