import * as React from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Запрос имени и email git, если в папке проекта они не заданы. */
export function GitIdentityDialog() {
  const missing = useStore((s) => s.gitIdentityMissing)
  const profile = useStore((s) => s.config.profile)
  const saveGitIdentity = useStore((s) => s.saveGitIdentity)
  const dismissGitIdentity = useStore((s) => s.dismissGitIdentity)
  const { toast } = useToast()

  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [scope, setScope] = React.useState<"local" | "global">("local")
  const [saving, setSaving] = React.useState(false)

  // при каждом открытии подставляем данные профиля приложения
  React.useEffect(() => {
    if (missing) {
      setName(profile.name)
      setEmail(profile.email)
    }
  }, [missing, profile.name, profile.email])

  async function save() {
    if (!name.trim() || !email.trim()) {
      toast({ title: "Укажите имя и email", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await saveGitIdentity(name.trim(), email.trim(), scope === "global")
      toast({
        title: "Данные git сохранены",
        description: scope === "global" ? "Для всех репозиториев" : "Только для этого проекта",
      })
    } catch (e) {
      toast({ title: "Не удалось сохранить", description: String(e), variant: "destructive" })
    }
    setSaving(false)
  }

  return (
    <Dialog open={missing} onOpenChange={(open) => !open && dismissGitIdentity()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Имя и email для git</DialogTitle>
          <DialogDescription>
            В git не задан автор коммитов. Без него синхронизация не сработает.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="gi-name">Имя</Label>
            <Input id="gi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gi-email">Email</Label>
            <Input
              id="gi-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="iivanov@nota.tech"
            />
          </div>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as "local" | "global")} className="gap-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="local" id="gi-local" className="mt-0.5" />
              <Label htmlFor="gi-local" className="font-normal">
                Только для этого проекта <span className="text-muted-foreground">(.git/config)</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="global" id="gi-global" className="mt-0.5" />
              <Label htmlFor="gi-global" className="font-normal">
                Для всех репозиториев <span className="text-muted-foreground">(глобально)</span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={dismissGitIdentity} disabled={saving}>
            Позже
          </Button>
          <Button onClick={save} disabled={saving}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
