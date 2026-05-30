# Tasks PWA — Development Stages

## Stage 14 — App Flexibility (feature toggles + Settings overhaul)

### Задача
Фича-тогглы и управление данными в Settings. Аналог `FeatureFlags.kt` из Android.

### Изменённые файлы

| Файл | Что изменено |
|------|-------------|
| `src/store/prefsStore.ts` | Добавлены `prioritiesEnabled`, `labelsEnabled`, `foldersEnabled` + сеттеры + сохранение/загрузка |
| `src/utils/smartTitle.ts` | Добавлен опциональный параметр `flags` для пропуска парсинга отключённых фич |
| `src/components/settings/SettingsPage.tsx` | Новый порядок карточек: Spreadsheet → Priorities → Labels → Folders → Calendars. Убраны заголовки секций. CRUD для Labels и Folders перенесён сюда из Sidebar |
| `src/components/layout/Sidebar.tsx` | Удалены секции Priorities и Labels. Папки — только навигация (без CRUD). Показываем Folders только когда `foldersEnabled` |
| `src/components/tasks/TaskItem.tsx` | Чекбокс, кнопки Priority/Labels, строка 2 — условно по флагам |
| `src/components/tasks/TaskCreateModal.tsx` | Поля Folder/Labels/Priority скрыты по флагам; флаги пробрасываются в parseSmartTitle |
| `src/components/tasks/TaskList.tsx` | FilterBar кнопки Priority/Labels/Folder скрыты по флагам |

### Правила
- Данные задач НИКОГДА не удаляются при отключении фичи — тоггл только скрывает UI
- Все флаги по умолчанию `true` — существующие пользователи не замечают изменений
- Настройки хранятся в Google Sheets (settings лист) через prefsStore → settingsApi
