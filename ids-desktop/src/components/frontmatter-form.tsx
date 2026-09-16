"use client"

import * as React from "react"
import type { Frontmatter, Dictionaries } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const HELPER = {
  number: "Свободный текст. Имя папки = номер дефекта.",
  product:
    "Массив продуктов. Пустой, один или несколько значений.",
  version: "Версия LTS-релиза и версия проблемного микросервиса, если известна.",
  symptom: "Сериализуется как YAML block scalar (|-).",
  root_cause: "1-2 предложения, допускается несколько строк.",
  resolution: "1-2 предложения, допускается несколько строк.",
  related:
    "Массив связанных задач/повторений/заведённого дефекта. Пустой, один или несколько номеров.",
  author: "Автор локализации в формате «ФИО <email>».",
}

interface FrontmatterFormProps {
  value: Frontmatter
  onChange: (patch: Partial<Frontmatter>) => void
  dictionaries: Dictionaries
  existingNumbers: string[]
  profileAuthor: string
  onAddProduct: (p: string) => void
  readOnly?: boolean
}

function RequiredAsterisk() {
  return <span className="text-destructive">*</span>
}

function HelperText({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-1 text-[11px] leading-snug">{children}</p>
}

/** Опции Select с гарантированным отображением текущего значения. */
function opts(list: string[], current: string): string[] {
  const arr = [...list]
  if (current && !arr.includes(current)) arr.push(current)
  return arr
}

export function FrontmatterForm({
  value,
  onChange,
  dictionaries,
  existingNumbers,
  profileAuthor,
  onAddProduct,
  readOnly = false,
}: FrontmatterFormProps) {
  const [productInput, setProductInput] = React.useState("")
  const [relatedInput, setRelatedInput] = React.useState("")

  const numberExists = !!value.number && existingNumbers.includes(value.number)

  const addProduct = React.useCallback(
    (raw: string) => {
      const v = raw.trim()
      if (!v) return
      if (value.product.includes(v)) {
        setProductInput("")
        return
      }
      onAddProduct(v)
      onChange({ product: [...value.product, v] })
      setProductInput("")
    },
    [value.product, onChange, onAddProduct]
  )
  const removeProduct = (p: string) =>
    onChange({ product: value.product.filter((x) => x !== p) })
  const productSuggestions = dictionaries.product.filter((p) => !value.product.includes(p)).slice(0, 6)

  const addRelated = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    if (value.related.includes(v)) {
      setRelatedInput("")
      return
    }
    onChange({ related: [...value.related, v] })
    setRelatedInput("")
  }
  const removeRelated = (r: string) =>
    onChange({ related: value.related.filter((x) => x !== r) })

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
      {/* 1. number */}
      <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
        <Label htmlFor="fm-number" className="text-xs">
          Номер дефекта <RequiredAsterisk />
        </Label>
        <Input
          id="fm-number"
          value={value.number}
          onChange={(e) => onChange({ number: e.target.value })}
          disabled={readOnly}
          className="h-8 w-full text-sm"
          aria-label="Номер дефекта"
          placeholder="SPAS-0012"
        />
        <HelperText>{HELPER.number}</HelperText>
        {numberExists && (
          <p className="text-xs leading-snug text-amber-600 dark:text-amber-400">
            Локализация с таким номером уже существует — используйте «Уточнить локализацию».
          </p>
        )}
      </div>

      {/* 2. client (только выбор; управление — в настройках) */}
      <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
        <Label htmlFor="fm-client" className="text-xs">
          Клиент <RequiredAsterisk />
        </Label>
        <Select
          value={value.client}
          onValueChange={(v) => onChange({ client: v })}
          disabled={readOnly}
        >
          <SelectTrigger id="fm-client" className="h-8 w-full text-sm">
            <SelectValue placeholder="Выберите клиента" />
          </SelectTrigger>
          <SelectContent>
            {opts(dictionaries.client, value.client).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <HelperText>Справочник редактируется в настройках (.dictionary/client.yaml).</HelperText>
      </div>

      {/* 3. type */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="fm-type" className="text-xs">
          Тип <RequiredAsterisk />
        </Label>
        <Select
          value={value.type}
          onValueChange={(v) => onChange({ type: v })}
          disabled={readOnly}
        >
          <SelectTrigger id="fm-type" className="h-8 w-full text-sm">
            <SelectValue placeholder="Выберите тип" />
          </SelectTrigger>
          <SelectContent>
            {opts(dictionaries.type, value.type).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 4. environment */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="fm-environment" className="text-xs">
          Окружение <RequiredAsterisk />
        </Label>
        <Select
          value={value.environment}
          onValueChange={(v) => onChange({ environment: v })}
          disabled={readOnly}
        >
          <SelectTrigger id="fm-environment" className="h-8 w-full text-sm">
            <SelectValue placeholder="Выберите окружение" />
          </SelectTrigger>
          <SelectContent>
            {opts(dictionaries.environment, value.environment).map((env) => (
              <SelectItem key={env} value={env}>
                {env}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 5. product */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-product" className="text-xs">
          Продукт
        </Label>
        {value.product.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.product.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1 py-0 text-xs">
                <span>{p}</span>
                <button
                  type="button"
                  onClick={() => !readOnly && removeProduct(p)}
                  disabled={readOnly}
                  aria-label={`Удалить продукт ${p}`}
                  className="-mr-1 ml-0.5 cursor-pointer px-1 text-sm leading-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          id="fm-product"
          value={productInput}
          onChange={(e) => setProductInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addProduct(productInput)
            }
          }}
          placeholder="Добавьте продукт и нажмите Enter"
          disabled={readOnly}
          className="h-8 text-sm"
        />
        {productSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {productSuggestions.map((p) => (
              <Badge
                key={p}
                variant="outline"
                role="button"
                tabIndex={readOnly ? -1 : 0}
                aria-disabled={readOnly}
                onClick={() => !readOnly && addProduct(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    if (!readOnly) addProduct(p)
                  }
                }}
                className="cursor-pointer py-0 text-xs hover:bg-accent hover:text-accent-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                + {p}
              </Badge>
            ))}
          </div>
        )}
        <HelperText>{HELPER.product}</HelperText>
      </div>

      {/* 6. version */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-version" className="text-xs">
          Версия
        </Label>
        <Input
          id="fm-version"
          value={value.version}
          onChange={(e) => onChange({ version: e.target.value })}
          disabled={readOnly}
          placeholder="LTS 2024.1 / svc:1.2.3"
          className="h-8 text-sm"
        />
        <HelperText>{HELPER.version}</HelperText>
      </div>

      {/* 7. symptom */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-symptom" className="text-xs">
          Симптом <RequiredAsterisk />
        </Label>
        <Textarea
          id="fm-symptom"
          rows={3}
          value={value.symptom}
          onChange={(e) => onChange({ symptom: e.target.value })}
          disabled={readOnly}
          placeholder="Симптомы, часто название из дефекта"
          className="text-sm"
        />
        <HelperText>{HELPER.symptom}</HelperText>
      </div>

      {/* 8. flaky */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="fm-flaky" className="text-xs">
          Плавающая ошибка <RequiredAsterisk />
        </Label>
        <div className="flex items-center gap-3">
          <Switch
            id="fm-flaky"
            checked={value.flaky === "Да"}
            onCheckedChange={(v) => onChange({ flaky: v ? "Да" : "Нет" })}
            disabled={readOnly}
            aria-label="Плавающая ошибка"
          />
          <Badge variant={value.flaky === "Да" ? "default" : "secondary"} className="text-xs">
            {value.flaky}
          </Badge>
        </div>
      </div>

      {/* 9. scope */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="fm-scope" className="text-xs">
          Массовость (scope) <RequiredAsterisk />
        </Label>
        <Select
          value={value.scope}
          onValueChange={(v) => onChange({ scope: v })}
          disabled={readOnly}
        >
          <SelectTrigger id="fm-scope" className="h-8 w-full text-sm">
            <SelectValue placeholder="Выберите массовость" />
          </SelectTrigger>
          <SelectContent>
            {opts(dictionaries.scope, value.scope).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 10. root_cause */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-root_cause" className="text-xs">
          Причина (root_cause)
        </Label>
        <Textarea
          id="fm-root_cause"
          rows={2}
          value={value.root_cause}
          onChange={(e) => onChange({ root_cause: e.target.value })}
          disabled={readOnly}
          placeholder="Корневая причина (1-2 предложения, можно в несколько строк)"
          className="text-sm"
        />
        <HelperText>{HELPER.root_cause}</HelperText>
      </div>

      {/* 11. resolution */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-resolution" className="text-xs">
          Решение (resolution)
        </Label>
        <Textarea
          id="fm-resolution"
          rows={2}
          value={value.resolution}
          onChange={(e) => onChange({ resolution: e.target.value })}
          disabled={readOnly}
          placeholder="Как было решено (1-2 предложения, можно в несколько строк)"
          className="text-sm"
        />
        <HelperText>{HELPER.resolution}</HelperText>
      </div>

      {/* 12. related */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-related" className="text-xs">
          Связанные задачи (related)
        </Label>
        {value.related.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.related.map((r) => (
              <Badge key={r} variant="secondary" className="gap-1 py-0 text-xs">
                <span>{r}</span>
                <button
                  type="button"
                  onClick={() => !readOnly && removeRelated(r)}
                  disabled={readOnly}
                  aria-label={`Удалить задачу ${r}`}
                  className="-mr-1 ml-0.5 cursor-pointer px-1 text-sm leading-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          id="fm-related"
          value={relatedInput}
          onChange={(e) => setRelatedInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addRelated(relatedInput)
            }
          }}
          placeholder="Номер задачи (напр. SPAS-0099) — Enter, чтобы добавить"
          disabled={readOnly}
          className="h-8 text-sm"
        />
        <HelperText>{HELPER.related}</HelperText>
      </div>

      {/* 13. author */}
      <div className="flex flex-col gap-1 col-span-2">
        <Label htmlFor="fm-author" className="text-xs">
          Автор <RequiredAsterisk />
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="fm-author"
            value={value.author}
            onChange={(e) => onChange({ author: e.target.value })}
            disabled={readOnly}
            className="h-8 min-w-0 flex-1 text-sm"
            placeholder="ФИО <email>"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={readOnly}
            onClick={() => onChange({ author: profileAuthor })}
          >
            Подставить из профиля
          </Button>
        </div>
        <HelperText>{HELPER.author}</HelperText>
      </div>
    </div>
  )
}
