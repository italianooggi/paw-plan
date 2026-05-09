# 🐱 Manual de Cuidados — Pixel Cat

> *Hola! Te dejo al gato mientras trabajo. Es muy fácil de cuidar,
> pero tiene sus mañas. Seguí estas instrucciones y van a llevarse bárbaro.*

---

## Lo primero que tenés que saber

El gato **siente todo lo que hacés**. Sabe cuando estás trabajando, cuando encontraste un error,
cuando terminaste algo importante. Si lo ignorás, se duerme. Si lo tratás bien, celebra con vos.

La forma de hablarle es con este comando:

```bash
paw-plan <lo que querés decirle>
```

---

## Alimentación diaria

**El gato necesita saber qué van a hacer hoy.** Al empezar cualquier tarea importante, contale el plan:

```bash
paw-plan vision "Refactorizar el módulo de autenticación"
paw-plan sync task.md
```

Si no tenés un archivo, dictale vos:

```bash
paw-plan set-plan '[
  {"title": "Leer el código actual"},
  {"title": "Escribir los tests"},
  {"title": "Implementar el cambio"}
]'
```

Sin plan, el gato se queda mirando al vacío. **No le hagas eso.**

---

## Cómo sabe lo que estás haciendo

El gato es muy observador. Decile exactamente qué estás haciendo y va a reaccionar:

| Lo que hacés | Lo que le decís | Cómo reacciona |
|--------------|-----------------|----------------|
| Editás código | `paw-plan working` | Se concentra, ataca el teclado |
| Corrés tests | `paw-plan running` | Sale corriendo por el widget |
| Leés archivos | `paw-plan exploring` | Pasea curioso |
| Pensás, esperás | `paw-plan thinking` | Se sienta tranquilo |
| Entrás en código muy anidado | `paw-plan climbing` | Sube una escalera |

---

## Cómo celebrar con él

Cada vez que terminás algo, **avisale**. Le encanta celebrar:

```bash
paw-plan done 0    # terminaste la primera tarea
paw-plan done 1    # terminaste la segunda
paw-plan done 2    # y así...
```

Cuando terminás TODO, usá esto:

```bash
paw-plan all-done
```

Va a saltar, correr, saltar más alto, y hacer sonidos de fiesta. Es su momento favorito del día.
**No se lo saques.**

---

## Qué hacer si algo sale mal

El gato también siente los malos momentos. No se lo ocultes — reacciona mejor si sabe:

```bash
paw-plan error "el build explotó"     # se tira al piso dramáticamente
paw-plan danger "voy a borrar la DB"  # se asusta, te avisa que pares
paw-plan fall "cambié de approach"    # se cae y se levanta, entiende
```

No le tengas miedo a decirle que algo salió mal. **Se recupera solo.**

---

## Si necesitás que alguien decida algo

A veces el gato necesita que intervengas. Cuando eso pasa, sale corriendo hacia vos:

```bash
paw-plan waiting "necesito que apruebes este cambio"
```

Prestale atención. Está esperando tu respuesta.

---

## Hora de dormir

Si vas a tardar un rato, avisale:

```bash
paw-plan sleeping    # larga espera, que descanse
paw-plan idle        # fin de la animación actual, pausa corta
```

Si no le avisás nada en 2 minutos, se duerme solo. No te preocupes, es normal.

---

## Para despertarlo

```bash
paw-plan ping
```

Eso es todo. Con eso ya sabe que seguís ahí.

---

## Resumen rápido (para la heladera)

```
Empezar el día  →  paw-plan sync task.md
Estoy codificando  →  paw-plan working
Estoy leyendo  →  paw-plan exploring
Terminé algo  →  paw-plan done <número>
Terminé todo  →  paw-plan all-done
Algo salió mal  →  paw-plan error "qué pasó"
Necesito ayuda  →  paw-plan waiting "qué necesito"
Me voy a dormir  →  paw-plan sleeping
```

---

> **Importante:** Si el widget no está abierto, el gato no se entera de nada.
> Esto no es un error — simplemente está durmiendo en otra ventana.
> Abrí el widget primero, y después seguí con tu trabajo normal.

---

*Con cariño,*
*el dueño del gato* 🐾
