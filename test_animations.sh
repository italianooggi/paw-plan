#!/bin/bash
# test_animations.sh — recorre todas las animaciones del gato

PP="node packages/paw-plan/cli.js"

echo "▶ SET_PLAN"
$PP vision "Testeando todas las animaciones del gato"
sleep 0.5
$PP set-plan '[{"title":"working"},{"title":"running"},{"title":"exploring"},{"title":"thinking"},{"title":"climbing"},{"title":"waiting"},{"title":"danger"},{"title":"error"},{"title":"fall"},{"title":"sleeping"},{"title":"all-done"}]'
sleep 1.5

echo "▶ WORKING (attack)"
$PP working
sleep 2

echo "▶ RUNNING (run)"
$PP running
sleep 2.5

echo "▶ EXPLORING (walk)"
$PP exploring
sleep 2

echo "▶ THINKING (idle)"
$PP thinking
sleep 2

echo "▶ CLIMBING (stairs)"
$PP climbing
sleep 3

echo "▶ WAITING_INPUT (run urgente)"
$PP waiting "necesito que apruebes esto"
sleep 3.5

echo "▶ DANGER (hurt)"
$PP danger "operación destructiva detectada"
sleep 2

echo "▶ ERROR / die"
$PP error "algo explotó"
sleep 3

echo "▶ PLAN_CHANGED (fall)"
$PP fall "cambié de enfoque"
sleep 2.5

echo "▶ SLEEPING (sleep)"
$PP sleeping
sleep 3

echo "▶ ALL_DONE (jump)"
$PP all-done
sleep 1

echo "✓ Test completo"
