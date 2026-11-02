/**
 * Start-up code for the LPC11xx (Cortex-M0): vector table, reset handler and default handlers
 *
 * @author Doumanix <doumanix@gmx.de> Copyright (c) 2026
 * Based on CMSIS startup_ARMCM0.c (CMSIS_5 5.9.0, Device/ARM/ARMCM0/Source), with the notices of the original:
 *
 * Copyright (c) 2009-2020 Arm Limited. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the License); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @par
 * Changes to the template: interrupt table of the LPC11xx (order of IRQn_Type in LPC11xx.h), checksum
 * for the LPC boot ROM in vector 7, the reset handler copies .data, clears .bss and calls the C++
 * constructors (__libc_init_array) before main().
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "system_LPC11xx.h"
#include <cstdint>

extern "C" {
// Symbols of the linker script (linkscripts/lpc1115.ld.in)
extern uint32_t __StackTop;
extern uint32_t __data_load__;
extern uint32_t __data_start__;
extern uint32_t __data_end__;
extern uint32_t __bss_start__;
extern uint32_t __bss_end__;
void __valid_user_code_checksum(); //!< 0 - sum of vectors 0..6, checked by the LPC boot ROM

void __libc_init_array();
int applicationMain() __asm__("main"); //!< main() of the application, ISO C++ forbids calling main directly

[[noreturn]] void Reset_Handler();
void Default_Handler();

// Exceptions
void NMI_Handler() __attribute__((weak, alias("Default_Handler")));
void HardFault_Handler() __attribute__((weak));
void SVC_Handler() __attribute__((weak, alias("Default_Handler")));
void PendSV_Handler() __attribute__((weak, alias("Default_Handler")));
void SysTick_Handler() __attribute__((weak, alias("Default_Handler")));

// Interrupts, names as used by sblib
void WAKEUP_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void CAN_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void SSP1_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void I2C_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void TIMER16_0_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void TIMER16_1_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void TIMER32_0_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void TIMER32_1_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void SSP0_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void UART_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void ADC_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void WDT_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void BOD_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void PIOINT3_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void PIOINT2_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void PIOINT1_IRQHandler() __attribute__((weak, alias("Default_Handler")));
void PIOINT0_IRQHandler() __attribute__((weak, alias("Default_Handler")));
}

namespace
{
    using VectorEntry = void (*)();
    constexpr uint32_t VectorCount = 16 + 32;
} // namespace

/**
 * @brief Vector table of the LPC11xx, placed at the start of the flash by the linker script.
 * @details IRQ numbers as in IRQn_Type of LPC11xx.h. The reserved entries and FMC (IRQ 27) stay 0.
 */
__attribute__((used, section(".isr_vector"))) const VectorEntry vectorTable[VectorCount] = {
        reinterpret_cast<VectorEntry>(&__StackTop), //      Initial stack pointer
        Reset_Handler,                              //      Reset handler
        NMI_Handler,                                // -14  NMI
        HardFault_Handler,                          // -13  Hard fault
        nullptr,                                    //      Reserved
        nullptr,                                    //      Reserved
        nullptr,                                    //      Reserved
        __valid_user_code_checksum,                 //      LPC boot ROM checksum
        nullptr,                                    //      Reserved
        nullptr,                                    //      Reserved
        nullptr,                                    //      Reserved
        SVC_Handler,                                //  -5  SVCall
        nullptr,                                    //      Reserved
        nullptr,                                    //      Reserved
        PendSV_Handler,                             //  -2  PendSV
        SysTick_Handler,                            //  -1  SysTick

        WAKEUP_IRQHandler,    //  0  WAKEUP0_IRQn  PIO0_0
        WAKEUP_IRQHandler,    //  1  WAKEUP1_IRQn  PIO0_1
        WAKEUP_IRQHandler,    //  2  WAKEUP2_IRQn  PIO0_2
        WAKEUP_IRQHandler,    //  3  WAKEUP3_IRQn  PIO0_3
        WAKEUP_IRQHandler,    //  4  WAKEUP4_IRQn  PIO0_4
        WAKEUP_IRQHandler,    //  5  WAKEUP5_IRQn  PIO0_5
        WAKEUP_IRQHandler,    //  6  WAKEUP6_IRQn  PIO0_6
        WAKEUP_IRQHandler,    //  7  WAKEUP7_IRQn  PIO0_7
        WAKEUP_IRQHandler,    //  8  WAKEUP8_IRQn  PIO0_8
        WAKEUP_IRQHandler,    //  9  WAKEUP9_IRQn  PIO0_9
        WAKEUP_IRQHandler,    // 10  WAKEUP10_IRQn PIO0_10
        WAKEUP_IRQHandler,    // 11  WAKEUP11_IRQn PIO0_11
        WAKEUP_IRQHandler,    // 12  WAKEUP12_IRQn PIO1_0
        CAN_IRQHandler,       // 13  CAN_IRQn
        SSP1_IRQHandler,      // 14  SSP1_IRQn
        I2C_IRQHandler,       // 15  I2C_IRQn
        TIMER16_0_IRQHandler, // 16  TIMER_16_0_IRQn
        TIMER16_1_IRQHandler, // 17  TIMER_16_1_IRQn
        TIMER32_0_IRQHandler, // 18  TIMER_32_0_IRQn
        TIMER32_1_IRQHandler, // 19  TIMER_32_1_IRQn
        SSP0_IRQHandler,      // 20  SSP0_IRQn
        UART_IRQHandler,      // 21  UART_IRQn
        nullptr,              // 22  Reserved0_IRQn
        nullptr,              // 23  Reserved1_IRQn
        ADC_IRQHandler,       // 24  ADC_IRQn
        WDT_IRQHandler,       // 25  WDT_IRQn
        BOD_IRQHandler,       // 26  BOD_IRQn
        nullptr,              // 27  FMC_IRQn, not used on the LPC111x
        PIOINT3_IRQHandler,   // 28  EINT3_IRQn
        PIOINT2_IRQHandler,   // 29  EINT2_IRQn
        PIOINT1_IRQHandler,   // 30  EINT1_IRQn
        PIOINT0_IRQHandler,   // 31  EINT0_IRQn
};

/**
 * @brief Reset handler: initializes RAM, the system clock and the C++ runtime, then calls main().
 */
void Reset_Handler()
{
    const uint32_t* source = &__data_load__;
    for (uint32_t* destination = &__data_start__; destination < &__data_end__; ++destination)
    {
        *destination = *source++;
    }
    for (uint32_t* destination = &__bss_start__; destination < &__bss_end__; ++destination)
    {
        *destination = 0;
    }

    SystemInit();
    __libc_init_array();
    applicationMain();

    while (true)
    {
    }
}

/**
 * @brief Hard fault handler, stops in an endless loop. sblib may provide its own.
 */
void HardFault_Handler()
{
    while (true)
    {
    }
}

/**
 * @brief Default handler for all exceptions and interrupts without an own handler.
 */
void Default_Handler()
{
    while (true)
    {
    }
}
