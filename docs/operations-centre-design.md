# Lasha Operations Centre Design Specification

## Overview

This document defines the visual language for the Operations Centre based on the existing Lasha dashboard design system.

---

## Design Tokens

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | #42B4D0 | Primary actions, active states |
| `--primary-dark` | #35ABC8 | Hover states |
| `--primary-light` | #C7EDF5 | Backgrounds, icons |
| `--yellow` | #FFD21F | Accent, notifications |
| `--background` | #FFFFFF | Page background |
| `--sidebar-bg` | #F8F8F8 | Sidebar background |
| `--surface` | #FFFFFF | Card background |
| `--surface-muted` | #F4F4F4 | Muted backgrounds |
| `--border` | #DEDEDE | Borders |
| `--border-light` | #E8E8E8 | Light borders |
| `--text-primary` | #202020 | Primary text |
| `--text-secondary` | #666666 | Secondary text |
| `--text-muted` | #9A9A9A | Muted text |

### Status Colors

| Status | Background | Text |
|--------|------------|------|
| `in-transit` | #E0F4FD | #0794B5 |
| `pending` | #F4F4F4 | #666666 |
| `completed` | #E6F9F0 | #0A7C42 |
| `paid` | #E6F9F0 | #0A7C42 |
| `cancelled` | #FDE8E8 | #C62828 |
| `failed` | #FDE8E8 | #C62828 |
| `warning` | #FFF3CD | #856404 |

### Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Page title | 22px | 700 | Inter |
| Page subtitle | 14px | 400 | Inter |
| Card title | 16px | 600 | Inter |
| Card value | 16px | 600 | Inter |
| Table header | 13px | 600 | Inter |
| Table cell | 14px | 400 | Inter |
| Filter tab | 13px | 500 | Inter |
| Badge | 12px | 500 | Inter |
| Label | 12px | 500 | Inter |
| Small text | 11px | 600 | Inter |

### Spacing

| Element | Value |
|---------|-------|
| Page padding | 28px 32px |
| Card padding | 20px |
| Card gap | 16px |
| Section gap | 28px |
| Element gap | 8-16px |

### Border Radius

| Element | Value |
|---------|-------|
| Cards | 10px |
| Buttons | 10px |
| Inputs | 10px |
| Badges | 20px |
| Icons | 10px |

---

## Component Patterns

### Page Layout

```
┌─────────────────────────────────────────┐
│              Top Navigation             │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │         Content              │
│          │                              │
│          │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

### Stats Cards

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Icon    │  │  Icon    │  │  Icon    │  │  Icon    │
│  Value   │  │  Value   │  │  Value   │  │  Value   │
│  Label   │  │  Label   │  │  Label   │  │  Label   │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Data Table

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ Header  │ Header  │ Header  │ Header  │ Header  │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ Cell    │ Cell    │ Cell    │ Cell    │ Cell    │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ Cell    │ Cell    │ Cell    │ Cell    │ Cell    │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

### Status Badge

```
┌─────────────────┐
│ ● Status Text   │
└─────────────────┘
```

---

## Reusable Components

### Existing Components to Reuse

1. **Sidebar** - `@/components/dashboard/Sidebar`
2. **TopNavigation** - `@/components/dashboard/TopNavigation`
3. **OrderPanel** - `@/components/dashboard/OrderPanel`
4. **DetailsPanel** - `@/components/dashboard/DetailsPanel`
5. **Status badges** - `@/styles/pages.css`

### CSS Classes to Reuse

- `.page-container` - Page wrapper
- `.page-header` - Page header
- `.page-title` - Page title
- `.page-subtitle` - Page subtitle
- `.data-table` - Data table
- `.status-badge` - Status badges
- `.filter-tabs` - Filter tabs
- `.filter-tab` - Filter tab
- `.info-card` - Info card
- `.empty-state` - Empty state
- `.card-grid` - Card grid

---

## Operations Centre Pages

### 1. Overview

- Key metrics (active deliveries, pending dispatch, completed today, etc.)
- Recent activity feed
- Quick actions

### 2. Dispatch

- Pending dispatch queue
- Driver assignment
- Dispatch history

### 3. Live Deliveries

- Real-time delivery list
- Status filters
- Quick actions (view, reassign)

### 4. Drivers

- Driver list
- Availability status
- Performance metrics

### 5. Exceptions

- Failed deliveries
- Reassignment requests
- Delayed deliveries

### 6. Delivery History

- Completed deliveries
- Search and filter
- Export capability

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| > 1199px | Full sidebar + content |
| 1024-1199px | Narrower sidebar |
| < 1024px | Collapsible sidebar, single column |
| < 640px | Mobile-optimized, stacked layout |
