"use client"

import { useEffect, useState } from "react"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { firebaseDb } from "@/lib/firebase"

export type ContactType = "customer" | "sales"

export type Contact = {
  id: string
  displayName?: string | null
  companyName?: string | null
  taxId?: string | null
  email?: string | null
  phone?: string | null
  type?: ContactType | null
}

export type ContactSnapshot = {
  id: string | null
  name: string | null
  email: string | null
  phone: string | null
  taxId: string | null
}

export const emptyContactSnapshot: ContactSnapshot = { id: null, name: null, email: null, phone: null, taxId: null }

export function useContacts(workspaceId: string | null): { contacts: Contact[]; loading: boolean } {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspaceId || !firebaseDb) {
      setContacts([])
      setLoading(false)
      return
    }
    setLoading(true)
    return onSnapshot(
      query(collection(firebaseDb, `workspaces/${workspaceId}/contacts`), orderBy("displayName", "asc")),
      (snapshot) => {
        setContacts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Contact)))
        setLoading(false)
      },
      (cause) => {
        console.error("contacts subscription failed", cause)
        setContacts([])
        setLoading(false)
      },
    )
  }, [workspaceId])

  return { contacts, loading }
}

function normalizeText(value?: string | null): string {
  return (value || "").trim().toLowerCase()
}

function normalizeTaxId(value?: string | null): string {
  return (value || "").replace(/[^a-z0-9]/gi, "").toLowerCase()
}

function namesOf(contact: Contact): string[] {
  return [contact.displayName, contact.companyName].map(normalizeText).filter(Boolean)
}

export function contactsOfType(contacts: Contact[], type: ContactType): Contact[] {
  return contacts.filter((contact) => contact.type === type)
}

/** Match only within the supplied (already type-filtered) contact list. */
export function matchContact(
  contacts: Contact[],
  candidate: { taxId?: string | null; name?: string | null; email?: string | null },
): string | null {
  if (!contacts.length) return null

  const taxId = normalizeTaxId(candidate.taxId)
  if (taxId) {
    const byTax = contacts.find((contact) => normalizeTaxId(contact.taxId) === taxId)
    if (byTax) return byTax.id
  }

  const email = normalizeText(candidate.email)
  if (email) {
    const byEmail = contacts.find((contact) => normalizeText(contact.email) === email)
    if (byEmail) return byEmail.id
  }

  const name = normalizeText(candidate.name)
  if (name) {
    const exact = contacts.find((contact) => namesOf(contact).includes(name))
    if (exact) return exact.id
    const partial = contacts.find((contact) => namesOf(contact).some((contactName) => contactName.length > 2 && (contactName.includes(name) || name.includes(contactName))))
    if (partial) return partial.id
  }

  return null
}

export function snapshotOf(contact: Contact | undefined | null): ContactSnapshot {
  if (!contact) return { ...emptyContactSnapshot }
  const customerName = contact.companyName?.trim() || contact.displayName?.trim() || null
  const handlerName = contact.displayName?.trim() || null
  return {
    id: contact.id,
    name: contact.type === "customer" ? customerName : handlerName,
    email: contact.email?.trim() || null,
    phone: contact.phone?.trim() || null,
    taxId: contact.taxId?.trim() || null,
  }
}

export function findContact(contacts: Contact[], id: string | null): Contact | undefined {
  if (!id) return undefined
  return contacts.find((contact) => contact.id === id)
}
