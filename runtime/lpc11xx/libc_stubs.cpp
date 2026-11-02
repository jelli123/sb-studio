/**
 * Minimal C library hooks for newlib-nano on the LPC11xx: heap (_sbrk) and abort()
 *
 * @author Doumanix <doumanix@gmx.de> Copyright (c) 2026
 *
 * @par
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 */

#include "LPC11xx.h"
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstdlib>

extern "C" {
extern uint8_t __HeapBase; //!< Start of the heap, end of .noinit (linker script)

void* _sbrk(ptrdiff_t increment);
}

namespace
{
    uint8_t* heapEnd = &__HeapBase; //!< Current end of the heap
}

/**
 * @brief Extends the heap for malloc().
 * @details The heap grows up to the current stack pointer.
 * @param increment Number of bytes to add.
 * @return Previous end of the heap, or (void*) -1 with errno = ENOMEM if the heap would reach the stack.
 */
void* _sbrk(const ptrdiff_t increment)
{
    uint8_t* const previousEnd = heapEnd;
    const auto stackPointer = reinterpret_cast<uint8_t*>(__get_MSP());
    if (previousEnd + increment > stackPointer)
    {
        errno = ENOMEM;
        return reinterpret_cast<void*>(-1);
    }
    heapEnd = previousEnd + increment;
    return previousEnd;
}

/**
 * @brief Stops in an endless loop. Used by operator new if the heap is exhausted.
 */
void abort()
{
    while (true)
    {
    }
}
